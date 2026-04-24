import type {
  Transaction,
  ListTransactionsFilters,
  ListTransactionsResult,
} from "../entities/transaction";
import type { DomainTrx } from "./audit.repository";

export interface InsertTransactionData {
  idempotencyKey: string;
  fromUserId: string;
  toUserId: string;
  amount: string;
  status: "pending" | "confirmed";
  confirmedAt?: Date;
}

/**
 * CRUD port. All business rules (threshold, balance validation, debit +
 * credit ordering, audit emission) live in `TransferService`. This port
 * only persists and queries.
 */
export interface TransactionRepository {
  // Read-only (standalone connection)
  findById(id: string): Promise<Transaction | null>;
  findByIdempotencyKey(key: string): Promise<Transaction | null>;
  list(filters: ListTransactionsFilters): Promise<ListTransactionsResult>;

  // Trx-aware
  findByIdForUpdate(id: string, trx: DomainTrx): Promise<Transaction | null>;
  insert(input: InsertTransactionData, trx: DomainTrx): Promise<Transaction>;
  markConfirmed(id: string, at: Date, trx: DomainTrx): Promise<Transaction>;
  markRejected(id: string, at: Date, trx: DomainTrx): Promise<Transaction>;
}
