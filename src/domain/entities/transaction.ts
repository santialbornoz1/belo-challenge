export const TRANSACTION_AUTO_APPROVE_THRESHOLD = "50000.00";

export type TransactionStatus = "pending" | "confirmed" | "rejected";

export interface TransactionUser {
  id: string;
  name: string;
  email: string;
}

export interface Transaction {
  id: string;
  idempotencyKey: string;
  fromUser: TransactionUser;
  toUser: TransactionUser;
  amount: string;
  status: TransactionStatus;
  createdAt: Date;
  confirmedAt: Date | null;
  rejectedAt: Date | null;
}

export interface CreateTransactionInput {
  fromUserId: string;
  toUserId: string;
  amount: string;
  idempotencyKey: string;
}

export interface ListTransactionsFilters {
  userId?: string;
  status?: TransactionStatus;
  limit: number;
  offset: number;
}

export interface ListTransactionsResult {
  transactions: Transaction[];
  total: number;
}
