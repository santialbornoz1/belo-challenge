export type UserRole = "user" | "admin";

export interface User {
  id: string;
  name: string;
  email: string;
  balance: string;
  role: UserRole;
  createdAt: string;
  updatedAt: string;
}

export type TransactionStatus = "pending" | "confirmed" | "rejected";

export interface EmbeddedUser {
  id: string;
  name: string;
  email: string;
}

export interface Transaction {
  id: string;
  fromUser: EmbeddedUser;
  toUser: EmbeddedUser;
  amount: string;
  status: TransactionStatus;
  idempotencyKey?: string;
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
}

export interface Pagination {
  total: number;
  limit: number;
  offset: number;
}

export interface ListTransactionsResponse {
  data: Transaction[];
  pagination: Pagination;
}

export interface ApiErrorBody {
  error: string;
  message?: string;
  details?: unknown;
}

export interface LogEntry {
  id: string;
  ts: number;
  method: string;
  url: string;
  status: number;
  durationMs: number;
  ok: boolean;
  requestBody?: unknown;
  requestHeaders?: Record<string, string>;
  responseBody?: unknown;
  label?: string;
}
