import type {
  ApiErrorBody,
  ListTransactionsResponse,
  LogEntry,
  Transaction,
  TransactionStatus,
  User,
} from "./types";

export const API_BASE_URL =
  import.meta.env.VITE_API_URL ?? "http://localhost:3001";

export interface ApiResult<T> {
  ok: boolean;
  status: number;
  body: T | ApiErrorBody | null;
  durationMs: number;
}

export type LogSink = (entry: LogEntry) => void;

interface RequestOptions {
  method: string;
  path: string;
  body?: unknown;
  headers?: Record<string, string>;
  label?: string;
  log?: LogSink;
}

async function request<T>({
  method,
  path,
  body,
  headers,
  label,
  log,
}: RequestOptions): Promise<ApiResult<T>> {
  const url = `${API_BASE_URL}${path}`;
  const finalHeaders: Record<string, string> = {
    Accept: "application/json",
    ...headers,
  };
  const init: RequestInit = { method, headers: finalHeaders };
  if (body !== undefined) {
    finalHeaders["Content-Type"] = "application/json";
    init.body = JSON.stringify(body);
  }

  const started = performance.now();
  let status = 0;
  let parsed: unknown = null;
  let fetchError: Error | null = null;

  try {
    const res = await fetch(url, init);
    status = res.status;
    const text = await res.text();
    if (text.length > 0) {
      try {
        parsed = JSON.parse(text);
      } catch {
        parsed = text;
      }
    }
  } catch (err) {
    fetchError = err instanceof Error ? err : new Error(String(err));
  }

  const durationMs = Math.round(performance.now() - started);
  const ok = status >= 200 && status < 300;

  log?.({
    id: crypto.randomUUID(),
    ts: Date.now(),
    method,
    url,
    status,
    durationMs,
    ok,
    requestBody: body,
    requestHeaders: finalHeaders,
    responseBody: fetchError ? { error: "NETWORK", message: fetchError.message } : parsed,
    label,
  });

  if (fetchError) {
    return {
      ok: false,
      status: 0,
      body: { error: "NETWORK", message: fetchError.message },
      durationMs,
    };
  }

  return { ok, status, body: parsed as T | ApiErrorBody | null, durationMs };
}

export const api = {
  health(log?: LogSink) {
    return request<{ status: string }>({ method: "GET", path: "/health", log, label: "health" });
  },

  createUser(
    input: { name: string; email: string; initialBalance?: string },
    log?: LogSink,
  ) {
    return request<User>({
      method: "POST",
      path: "/api/users",
      body: input,
      log,
      label: "createUser",
    });
  },

  listUsers(
    params: { limit?: number; offset?: number } = {},
    log?: LogSink,
  ) {
    const qs = new URLSearchParams();
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<{ data: User[] }>({
      method: "GET",
      path: `/api/users${suffix}`,
      log,
      label: "listUsers",
    });
  },

  getUser(id: string, log?: LogSink) {
    return request<User>({
      method: "GET",
      path: `/api/users/${id}`,
      log,
      label: "getUser",
    });
  },

  createTransaction(
    input: {
      fromUserId: string;
      toUserId: string;
      amount: string;
      idempotencyKey: string;
    },
    callerUserId: string,
    log?: LogSink,
    extraHeaders?: Record<string, string>,
  ) {
    return request<Transaction>({
      method: "POST",
      path: "/api/transactions",
      body: input,
      headers: { "x-user-id": callerUserId, ...extraHeaders },
      log,
      label: "createTransaction",
    });
  },

  listTransactions(
    params: {
      userId?: string;
      status?: TransactionStatus;
      limit?: number;
      offset?: number;
    },
    callerUserId: string,
    log?: LogSink,
  ) {
    const qs = new URLSearchParams();
    if (params.userId) qs.set("userId", params.userId);
    if (params.status) qs.set("status", params.status);
    if (params.limit !== undefined) qs.set("limit", String(params.limit));
    if (params.offset !== undefined) qs.set("offset", String(params.offset));
    const suffix = qs.toString() ? `?${qs.toString()}` : "";
    return request<ListTransactionsResponse>({
      method: "GET",
      path: `/api/transactions${suffix}`,
      headers: { "x-user-id": callerUserId },
      log,
      label: "listTransactions",
    });
  },

  getTransaction(id: string, callerUserId: string, log?: LogSink) {
    return request<Transaction>({
      method: "GET",
      path: `/api/transactions/${id}`,
      headers: { "x-user-id": callerUserId },
      log,
      label: "getTransaction",
    });
  },

  approveTransaction(id: string, callerUserId: string, log?: LogSink) {
    return request<Transaction>({
      method: "PATCH",
      path: `/api/transactions/${id}/approve`,
      headers: { "x-user-id": callerUserId },
      log,
      label: "approveTransaction",
    });
  },

  rejectTransaction(id: string, callerUserId: string, log?: LogSink) {
    return request<Transaction>({
      method: "PATCH",
      path: `/api/transactions/${id}/reject`,
      headers: { "x-user-id": callerUserId },
      log,
      label: "rejectTransaction",
    });
  },
};

export function extractError(body: unknown): ApiErrorBody | null {
  if (!body || typeof body !== "object") return null;
  if ("error" in (body as Record<string, unknown>)) return body as ApiErrorBody;
  return null;
}

export function isApiError(r: ApiResult<unknown>): r is ApiResult<ApiErrorBody> {
  return !r.ok;
}
