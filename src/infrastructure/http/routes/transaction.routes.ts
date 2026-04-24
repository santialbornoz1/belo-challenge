import type { FastifyInstance } from "fastify";
import { ObjectionTransactionRepository } from "../../repositories/objection-transaction.repository";
import { ObjectionUserRepository } from "../../repositories/objection-user.repository";
import { KnexAuditRepository } from "../../repositories/knex-audit.repository";
import { KnexUnitOfWork } from "../../repositories/knex-unit-of-work";
import { TransferServiceImpl } from "../../../application/services/transfer.service";
import {
  CreateTransactionUseCaseImpl,
  type CreateTransactionUseCase,
} from "../../../application/use-cases/create-transaction.use-case";
import {
  ApproveTransactionUseCaseImpl,
  type ApproveTransactionUseCase,
} from "../../../application/use-cases/approve-transaction.use-case";
import {
  RejectTransactionUseCaseImpl,
  type RejectTransactionUseCase,
} from "../../../application/use-cases/reject-transaction.use-case";
import {
  ListTransactionsUseCaseImpl,
  type ListTransactionsUseCase,
} from "../../../application/use-cases/list-transactions.use-case";
import {
  createTransactionSchema,
  type CreateTransactionBody,
  listTransactionsSchema,
  type ListTransactionsQuery,
  getTransactionSchema,
  approveTransactionSchema,
  rejectTransactionSchema,
  type TransactionIdParams,
} from "../schemas/transaction.schema";
import {
  buildRequireUser,
  isAdmin,
  requireAdmin,
} from "../middleware/auth.middleware";
import {
  ForbiddenError,
  TransactionNotFoundError,
} from "../../../domain/errors";
import type { Transaction } from "../../../domain/entities/transaction";

export async function transactionRoutes(fastify: FastifyInstance): Promise<void> {
  const userRepo = new ObjectionUserRepository();
  const auditRepo = new KnexAuditRepository();
  const transactionRepo = new ObjectionTransactionRepository();
  const uow = new KnexUnitOfWork();
  const transferService = new TransferServiceImpl(uow, userRepo, transactionRepo, auditRepo);

  const createTx: CreateTransactionUseCase = new CreateTransactionUseCaseImpl(transferService);
  const approveTx: ApproveTransactionUseCase = new ApproveTransactionUseCaseImpl(transferService);
  const rejectTx: RejectTransactionUseCase = new RejectTransactionUseCaseImpl(transferService);
  const listTx: ListTransactionsUseCase = new ListTransactionsUseCaseImpl(transactionRepo);

  const requireUser = buildRequireUser(userRepo);

  fastify.post<{ Body: CreateTransactionBody }>(
    "/",
    { schema: createTransactionSchema, preHandler: requireUser },
    async (req, reply) => {
      // Policy: the caller must be the sender of the tx (or an admin
      // acting on behalf). Prevents Alice from spending Bob's balance
      // just because she knows his id.
      if (!isAdmin(req.user) && req.body.fromUserId !== req.user!.id) {
        throw new ForbiddenError("Cannot create a transaction on behalf of another user");
      }

      const outcome = await createTx.execute(req.body);
      req.log.info(
        {
          transactionId: outcome.transaction.id,
          status: outcome.transaction.status,
          alreadyExisted: outcome.alreadyExisted,
          actorUserId: req.user!.id,
        },
        "transaction.create",
      );
      return reply
        .status(outcome.alreadyExisted ? 200 : 201)
        .send(serializeTransaction(outcome.transaction));
    },
  );

  fastify.get<{ Querystring: ListTransactionsQuery }>(
    "/",
    { schema: listTransactionsSchema, preHandler: requireUser },
    async (req) => {
      // Policy:
      //  - no userId filter → admin only (global listing is sensitive)
      //  - userId filter for someone else → admin only
      //  - userId filter matching caller → allowed
      if (!isAdmin(req.user)) {
        if (!req.query.userId) {
          throw new ForbiddenError("Admin role required to list all transactions");
        }
        if (req.query.userId !== req.user!.id) {
          throw new ForbiddenError("Cannot list transactions of another user");
        }
      }

      const { transactions, total } = await listTx.execute(req.query);
      return {
        data: transactions.map(serializeTransaction),
        pagination: {
          total,
          limit: Math.min(Math.max(req.query.limit ?? 20, 1), 100),
          offset: Math.max(req.query.offset ?? 0, 0),
        },
      };
    },
  );

  fastify.get<{ Params: TransactionIdParams }>(
    "/:id",
    { schema: getTransactionSchema, preHandler: requireUser },
    async (req) => {
      const tx = await transactionRepo.findById(req.params.id);
      if (!tx) throw new TransactionNotFoundError(req.params.id);

      // Policy: admin OR party to the transaction.
      if (
        !isAdmin(req.user) &&
        tx.fromUser.id !== req.user!.id &&
        tx.toUser.id !== req.user!.id
      ) {
        throw new ForbiddenError("You are not a party to this transaction");
      }

      return serializeTransaction(tx);
    },
  );

  // Manual approvals are a compliance/ops role, not the sender's job.
  fastify.patch<{ Params: TransactionIdParams }>(
    "/:id/approve",
    { schema: approveTransactionSchema, preHandler: [requireUser, requireAdmin] },
    async (req) => {
      const tx = await approveTx.execute({ id: req.params.id, actorUserId: req.user!.id });
      req.log.info(
        { transactionId: tx.id, actorUserId: req.user!.id },
        "transaction.approve",
      );
      return serializeTransaction(tx);
    },
  );

  fastify.patch<{ Params: TransactionIdParams }>(
    "/:id/reject",
    { schema: rejectTransactionSchema, preHandler: [requireUser, requireAdmin] },
    async (req) => {
      const tx = await rejectTx.execute({ id: req.params.id, actorUserId: req.user!.id });
      req.log.info(
        { transactionId: tx.id, actorUserId: req.user!.id },
        "transaction.reject",
      );
      return serializeTransaction(tx);
    },
  );
}

function serializeTransaction(tx: Transaction) {
  return {
    id: tx.id,
    fromUser: { id: tx.fromUser.id, name: tx.fromUser.name, email: tx.fromUser.email },
    toUser: { id: tx.toUser.id, name: tx.toUser.name, email: tx.toUser.email },
    amount: tx.amount,
    status: tx.status,
    createdAt: tx.createdAt.toISOString(),
    confirmedAt: tx.confirmedAt ? tx.confirmedAt.toISOString() : null,
    rejectedAt: tx.rejectedAt ? tx.rejectedAt.toISOString() : null,
  };
}
