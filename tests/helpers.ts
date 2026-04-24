import type { FastifyInstance } from "fastify";
import { buildApp } from "../src/app";

export async function newApp(): Promise<FastifyInstance> {
  const app = await buildApp({ logger: false });
  await app.ready();
  return app;
}

export async function truncateAll(app: FastifyInstance): Promise<void> {
  await app.knex.raw(
    'TRUNCATE TABLE "audit_logs", "transactions", "users" RESTART IDENTITY CASCADE',
  );
}

interface SeededUser {
  id: string;
  name: string;
  email: string;
  balance: string;
  role: "user" | "admin";
}

export async function seedUser(
  app: FastifyInstance,
  overrides: Partial<{ name: string; email: string; balance: string }> = {},
): Promise<SeededUser> {
  const suffix = Math.random().toString(36).slice(2, 10);
  const payload = {
    name: overrides.name ?? `User ${suffix}`,
    email: overrides.email ?? `user-${suffix}@test.local`,
    initialBalance: overrides.balance ?? "0",
  };
  const res = await app.inject({
    method: "POST",
    url: "/api/users",
    payload,
  });
  if (res.statusCode !== 201) {
    throw new Error(`seedUser failed: ${res.statusCode} ${res.body}`);
  }
  return { ...(res.json() as Omit<SeededUser, "role">), role: "user" };
}

/**
 * Seeds a user and promotes them to admin via direct DB write — `role`
 * isn't exposed through `POST /api/users` on purpose (no public promotion).
 */
export async function seedAdmin(
  app: FastifyInstance,
  overrides: Partial<{ name: string; email: string; balance: string }> = {},
): Promise<SeededUser> {
  const u = await seedUser(app, overrides);
  await app.knex("users").where({ id: u.id }).update({ role: "admin" });
  return { ...u, role: "admin" };
}

export async function getBalance(app: FastifyInstance, userId: string): Promise<string> {
  const res = await app.inject({ method: "GET", url: `/api/users/${userId}` });
  if (res.statusCode !== 200) {
    throw new Error(`getBalance failed: ${res.statusCode} ${res.body}`);
  }
  return (res.json() as { balance: string }).balance;
}

export interface PostTxBody {
  fromUserId: string;
  toUserId: string;
  amount: string;
  idempotencyKey: string;
}

export async function postTransaction(
  app: FastifyInstance,
  actor: string,
  body: PostTxBody,
) {
  return app.inject({
    method: "POST",
    url: "/api/transactions",
    headers: { "x-user-id": actor, "content-type": "application/json" },
    payload: body,
  });
}

export async function approveTransaction(
  app: FastifyInstance,
  actor: string,
  id: string,
) {
  return app.inject({
    method: "PATCH",
    url: `/api/transactions/${id}/approve`,
    headers: { "x-user-id": actor },
  });
}

export async function rejectTransaction(
  app: FastifyInstance,
  actor: string,
  id: string,
) {
  return app.inject({
    method: "PATCH",
    url: `/api/transactions/${id}/reject`,
    headers: { "x-user-id": actor },
  });
}

export async function listTransactions(
  app: FastifyInstance,
  actor: string,
  query: { userId?: string; status?: string; limit?: number; offset?: number } = {},
) {
  const qs = new URLSearchParams();
  if (query.userId) qs.set("userId", query.userId);
  if (query.status) qs.set("status", query.status);
  if (query.limit !== undefined) qs.set("limit", String(query.limit));
  if (query.offset !== undefined) qs.set("offset", String(query.offset));
  return app.inject({
    method: "GET",
    url: `/api/transactions${qs.toString() ? `?${qs}` : ""}`,
    headers: { "x-user-id": actor },
  });
}

export function uniqueKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}
