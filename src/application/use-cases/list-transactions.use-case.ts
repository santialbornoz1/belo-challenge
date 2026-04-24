import type { TransactionRepository } from "../../domain/ports/transaction.repository";
import type {
  ListTransactionsResult,
  TransactionStatus,
} from "../../domain/entities/transaction";

export interface ListTransactionsCommand {
  userId?: string;
  status?: TransactionStatus;
  limit?: number;
  offset?: number;
}

export interface ListTransactionsUseCase {
  execute(cmd: ListTransactionsCommand): Promise<ListTransactionsResult>;
}

const DEFAULT_LIMIT = 20;
const MAX_LIMIT = 100;

export class ListTransactionsUseCaseImpl implements ListTransactionsUseCase {
  constructor(private readonly transactionRepo: TransactionRepository) {}

  async execute(cmd: ListTransactionsCommand): Promise<ListTransactionsResult> {
    const limit = Math.min(Math.max(cmd.limit ?? DEFAULT_LIMIT, 1), MAX_LIMIT);
    const offset = Math.max(cmd.offset ?? 0, 0);
    return this.transactionRepo.list({
      userId: cmd.userId,
      status: cmd.status,
      limit,
      offset,
    });
  }
}
