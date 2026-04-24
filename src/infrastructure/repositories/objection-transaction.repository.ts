import type { Knex } from "knex";
import type {
  TransactionRepository,
  InsertTransactionData,
} from "../../domain/ports/transaction.repository";
import type {
  Transaction,
  ListTransactionsFilters,
  ListTransactionsResult,
} from "../../domain/entities/transaction";
import type { DomainTrx } from "../../domain/ports/audit.repository";
import {
  DuplicateIdempotencyKeyError,
  InvalidAmountError,
  SameUserError,
  UserNotFoundError,
  InsufficientFundsError,
  AppError,
} from "../../domain/errors";
import { TransactionModel } from "../models/transaction.model";
import {
  isPgUniqueViolation,
  isPgCheckViolation,
  isPgForeignKeyViolation,
} from "./pg-errors";

const TX_WITH_USERS = "[fromUser, toUser]";

function asKnexTrx(trx: DomainTrx): Knex.Transaction {
  return trx as unknown as Knex.Transaction;
}

function toEntity(m: TransactionModel): Transaction {
  if (!m.fromUser || !m.toUser) {
    throw new Error(
      `TransactionModel ${m.id} reached toEntity without its fromUser/toUser graph loaded`,
    );
  }
  return {
    id: m.id,
    idempotencyKey: m.idempotencyKey,
    fromUser: {
      id: m.fromUser.id,
      name: m.fromUser.name,
      email: m.fromUser.email,
    },
    toUser: {
      id: m.toUser.id,
      name: m.toUser.name,
      email: m.toUser.email,
    },
    amount: String(m.amount),
    status: m.status,
    createdAt: new Date(m.createdAt),
    confirmedAt: m.confirmedAt ? new Date(m.confirmedAt) : null,
    rejectedAt: m.rejectedAt ? new Date(m.rejectedAt) : null,
  };
}

export class ObjectionTransactionRepository implements TransactionRepository {
  async findById(id: string): Promise<Transaction | null> {
    const m = await TransactionModel.query().findById(id).withGraphFetched(TX_WITH_USERS);
    return m ? toEntity(m) : null;
  }

  async findByIdempotencyKey(key: string): Promise<Transaction | null> {
    const m = await TransactionModel.query()
      .findOne({ idempotencyKey: key })
      .withGraphFetched(TX_WITH_USERS);
    return m ? toEntity(m) : null;
  }

  async list(filters: ListTransactionsFilters): Promise<ListTransactionsResult> {
    const baseQuery = () => {
      let q = TransactionModel.query();
      if (filters.userId) {
        q = q.where((b) => {
          b.where("fromUserId", filters.userId!).orWhere("toUserId", filters.userId!);
        });
      }
      if (filters.status) q = q.where("status", filters.status);
      return q;
    };

    const [rows, countResult] = await Promise.all([
      baseQuery()
        .withGraphFetched(TX_WITH_USERS)
        .orderBy("createdAt", "desc")
        .limit(filters.limit)
        .offset(filters.offset),
      baseQuery().count("* as total").first(),
    ]);

    return {
      transactions: rows.map(toEntity),
      total: Number((countResult as unknown as { total: string })?.total ?? 0),
    };
  }

  async findByIdForUpdate(id: string, trx: DomainTrx): Promise<Transaction | null> {
    const knexTrx = asKnexTrx(trx);
    const m = await TransactionModel.query(knexTrx).findById(id).forUpdate();
    if (!m) return null;
    await m.$fetchGraph(TX_WITH_USERS, { transaction: knexTrx });
    return toEntity(m);
  }

  async insert(input: InsertTransactionData, trx: DomainTrx): Promise<Transaction> {
    const knexTrx = asKnexTrx(trx);
    try {
      const created = await TransactionModel.query(knexTrx).insertAndFetch({
        idempotencyKey: input.idempotencyKey,
        fromUserId: input.fromUserId,
        toUserId: input.toUserId,
        amount: input.amount,
        status: input.status,
        confirmedAt: input.confirmedAt ? input.confirmedAt.toISOString() : null,
      });
      await created.$fetchGraph(TX_WITH_USERS, { transaction: knexTrx });
      return toEntity(created);
    } catch (err) {
      throw mapDbError(err, input.idempotencyKey);
    }
  }

  async markConfirmed(id: string, at: Date, trx: DomainTrx): Promise<Transaction> {
    const knexTrx = asKnexTrx(trx);
    const updated = await TransactionModel.query(knexTrx).patchAndFetchById(id, {
      status: "confirmed",
      confirmedAt: at.toISOString(),
    });
    await updated.$fetchGraph(TX_WITH_USERS, { transaction: knexTrx });
    return toEntity(updated);
  }

  async markRejected(id: string, at: Date, trx: DomainTrx): Promise<Transaction> {
    const knexTrx = asKnexTrx(trx);
    const updated = await TransactionModel.query(knexTrx).patchAndFetchById(id, {
      status: "rejected",
      rejectedAt: at.toISOString(),
    });
    await updated.$fetchGraph(TX_WITH_USERS, { transaction: knexTrx });
    return toEntity(updated);
  }
}

/**
 * Central mapper from DB-level errors to domain errors. Keeps the repo
 * logic readable and guarantees a typed error even when a constraint saves
 * us from a bug higher up (defence in depth).
 */
function mapDbError(err: unknown, idempotencyKey?: string): unknown {
  if (err instanceof AppError) return err;

  if (idempotencyKey && isPgUniqueViolation(err, "idempotency_key")) {
    return new DuplicateIdempotencyKeyError(idempotencyKey);
  }

  if (isPgCheckViolation(err, "transactions_amount_positive")) {
    return new InvalidAmountError();
  }
  if (isPgCheckViolation(err, "transactions_distinct_users")) {
    return new SameUserError();
  }
  if (isPgCheckViolation(err, "users_balance_non_negative")) {
    return new InsufficientFundsError("unknown", "0", "0");
  }

  if (isPgForeignKeyViolation(err)) {
    return new UserNotFoundError("unknown");
  }

  return err;
}
