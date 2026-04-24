import Decimal from "decimal.js";
import type { UserRepository } from "../../domain/ports/user.repository";
import type { TransactionRepository } from "../../domain/ports/transaction.repository";
import type { AuditRepository } from "../../domain/ports/audit.repository";
import type { UnitOfWork } from "../../domain/ports/unit-of-work";
import {
  type Transaction,
  type CreateTransactionInput,
  TRANSACTION_AUTO_APPROVE_THRESHOLD,
} from "../../domain/entities/transaction";
import {
  InvalidAmountError,
  SameUserError,
  UserNotFoundError,
  InsufficientFundsError,
  TransactionNotFoundError,
  InvalidTransactionStateError,
  DuplicateIdempotencyKeyError,
} from "../../domain/errors";

export interface CreateOutcome {
  transaction: Transaction;
  alreadyExisted: boolean;
  movedFunds: boolean;
}

export interface TransferService {
  create(cmd: CreateTransactionInput): Promise<CreateOutcome>;
  approve(id: string, actorUserId: string): Promise<Transaction>;
  reject(id: string, actorUserId: string): Promise<Transaction>;
}

export class TransferServiceImpl implements TransferService {
  constructor(
    private readonly uow: UnitOfWork,
    private readonly userRepo: UserRepository,
    private readonly txRepo: TransactionRepository,
    private readonly audit: AuditRepository,
    private readonly autoApproveThreshold: string = TRANSACTION_AUTO_APPROVE_THRESHOLD,
  ) {}

  async create(cmd: CreateTransactionInput): Promise<CreateOutcome> {
    const amount = new Decimal(cmd.amount);
    if (!amount.isFinite() || amount.lte(0)) throw new InvalidAmountError();
    if (cmd.fromUserId === cmd.toUserId) throw new SameUserError();

    // Fast idempotency path: hit before opening a transaction.
    const existing = await this.txRepo.findByIdempotencyKey(cmd.idempotencyKey);
    if (existing) return asIdempotentHit(existing);

    try {
      return await this.uow.runInTransaction(async (trx) => {
        const orderedIds = [cmd.fromUserId, cmd.toUserId].sort();
        const locked = await this.userRepo.findByIdsForUpdate(orderedIds, trx);

        const fromUser = locked.get(cmd.fromUserId);
        const toUser = locked.get(cmd.toUserId);
        if (!fromUser) throw new UserNotFoundError(cmd.fromUserId);
        if (!toUser) throw new UserNotFoundError(cmd.toUserId);

        // Balance is checked for every create, pending included — accepting
        // a pending we know can't be approved would only add noise to the
        // ops queue. Approve re-validates in case the balance dropped.
        const balance = new Decimal(fromUser.balance);
        if (balance.lt(amount)) {
          throw new InsufficientFundsError(fromUser.id, balance.toFixed(2), amount.toFixed(2));
        }

        const threshold = new Decimal(this.autoApproveThreshold);
        const requiresManualApproval = amount.gt(threshold);
        const amountFixed = amount.toFixed(2);
        const now = new Date();

        let movedFunds = false;
        if (!requiresManualApproval) {
          const newFrom = balance.sub(amount).toFixed(2);
          const newTo = new Decimal(toUser.balance).add(amount).toFixed(2);
          await this.userRepo.updateBalance(fromUser.id, newFrom, trx);
          await this.userRepo.updateBalance(toUser.id, newTo, trx);
          movedFunds = true;
        }

        const tx = await this.txRepo.insert(
          {
            idempotencyKey: cmd.idempotencyKey,
            fromUserId: cmd.fromUserId,
            toUserId: cmd.toUserId,
            amount: amountFixed,
            status: requiresManualApproval ? "pending" : "confirmed",
            confirmedAt: movedFunds ? now : undefined,
          },
          trx,
        );

        await this.audit.log(
          {
            action: movedFunds ? "TRANSACTION_CONFIRMED" : "TRANSACTION_PENDING_CREATED",
            entity: "transaction",
            entityId: tx.id,
            actorUserId: cmd.fromUserId,
            metadata: {
              fromUserId: cmd.fromUserId,
              toUserId: cmd.toUserId,
              amount: amountFixed,
              movedFunds,
              requiresManualApproval,
            },
          },
          trx,
        );

        return { transaction: tx, alreadyExisted: false, movedFunds };
      });
    } catch (err) {
      // Idempotency race: the fast-path lookup missed because a concurrent
      // request inserted first. The DB UNIQUE rejected us. Instead of
      // surfacing a 409 to an honest retrier, reload the winning tx and
      // report it as an idempotent hit (200).
      if (err instanceof DuplicateIdempotencyKeyError) {
        const winner = await this.txRepo.findByIdempotencyKey(cmd.idempotencyKey);
        if (winner) return asIdempotentHit(winner);
      }
      throw err;
    }
  }

  async approve(id: string, actorUserId: string): Promise<Transaction> {
    return this.uow.runInTransaction(async (trx) => {
      const tx = await this.txRepo.findByIdForUpdate(id, trx);
      if (!tx) throw new TransactionNotFoundError(id);
      if (tx.status !== "pending") {
        throw new InvalidTransactionStateError(id, tx.status, "pending");
      }

      const orderedIds = [tx.fromUser.id, tx.toUser.id].sort();
      const locked = await this.userRepo.findByIdsForUpdate(orderedIds, trx);
      const fromUser = locked.get(tx.fromUser.id);
      const toUser = locked.get(tx.toUser.id);
      if (!fromUser) throw new UserNotFoundError(tx.fromUser.id);
      if (!toUser) throw new UserNotFoundError(tx.toUser.id);

      const balance = new Decimal(fromUser.balance);
      const amount = new Decimal(tx.amount);
      if (balance.lt(amount)) {
        throw new InsufficientFundsError(fromUser.id, balance.toFixed(2), amount.toFixed(2));
      }

      const newFrom = balance.sub(amount).toFixed(2);
      const newTo = new Decimal(toUser.balance).add(amount).toFixed(2);
      await this.userRepo.updateBalance(fromUser.id, newFrom, trx);
      await this.userRepo.updateBalance(toUser.id, newTo, trx);

      const now = new Date();
      const updated = await this.txRepo.markConfirmed(id, now, trx);

      await this.audit.log(
        {
          action: "TRANSACTION_APPROVED",
          entity: "transaction",
          entityId: id,
          actorUserId,
          metadata: {
            fromUserId: tx.fromUser.id,
            toUserId: tx.toUser.id,
            amount: amount.toFixed(2),
            previousStatus: "pending",
          },
        },
        trx,
      );

      return updated;
    });
  }

  async reject(id: string, actorUserId: string): Promise<Transaction> {
    return this.uow.runInTransaction(async (trx) => {
      const tx = await this.txRepo.findByIdForUpdate(id, trx);
      if (!tx) throw new TransactionNotFoundError(id);
      if (tx.status !== "pending") {
        throw new InvalidTransactionStateError(id, tx.status, "pending");
      }

      const now = new Date();
      const updated = await this.txRepo.markRejected(id, now, trx);

      await this.audit.log(
        {
          action: "TRANSACTION_REJECTED",
          entity: "transaction",
          entityId: id,
          actorUserId,
          metadata: {
            fromUserId: tx.fromUser.id,
            toUserId: tx.toUser.id,
            amount: tx.amount,
            previousStatus: "pending",
          },
        },
        trx,
      );

      return updated;
    });
  }
}

function asIdempotentHit(existing: Transaction): CreateOutcome {
  return {
    transaction: existing,
    alreadyExisted: true,
    movedFunds: existing.status === "confirmed",
  };
}
