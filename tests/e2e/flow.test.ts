import type { FastifyInstance } from "fastify";
import { buildApp } from "../../src/app";

/**
 * E2E — real HTTP server on a random port, real fetch client. This is the
 * only suite that exercises the actual network stack (Fastify's server, not
 * inject), so it catches regressions in host/port binding, keep-alive,
 * headers propagation, CORS, etc.
 */

interface UserBody {
  id: string;
  name: string;
  email: string;
  balance: string;
  createdAt: string;
  updatedAt: string;
}

interface TransactionUserBody {
  id: string;
  name: string;
  email: string;
}

interface TransactionBody {
  id: string;
  fromUser: TransactionUserBody;
  toUser: TransactionUserBody;
  amount: string;
  status: "pending" | "confirmed" | "rejected";
  createdAt: string;
  confirmedAt: string | null;
  rejectedAt: string | null;
}

function uniqueKey(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
}

describe("e2e — real HTTP server + fetch client", () => {
  let app: FastifyInstance;
  let baseUrl: string;

  beforeAll(async () => {
    app = await buildApp({ logger: false });
    // port 0 -> kernel picks a free one. Bind to 127.0.0.1 so we don't
    // expose a test server on the LAN by accident.
    const address = await app.listen({ port: 0, host: "127.0.0.1" });
    baseUrl = address;
    // Clean slate across the DB before the flow
    await app.knex.raw(
      'TRUNCATE TABLE "audit_logs", "transactions", "users" RESTART IDENTITY CASCADE',
    );
  });

  afterAll(async () => {
    await app.close();
  });

  async function api<T = unknown>(
    method: string,
    path: string,
    opts: { body?: unknown; userId?: string } = {},
  ): Promise<{ status: number; body: T }> {
    const headers: Record<string, string> = {};
    if (opts.userId) headers["x-user-id"] = opts.userId;
    if (opts.body !== undefined) headers["content-type"] = "application/json";
    const res = await fetch(`${baseUrl}${path}`, {
      method,
      headers,
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
    const text = await res.text();
    const body = text ? JSON.parse(text) : null;
    return { status: res.status, body: body as T };
  }

  it("health probe answers over real HTTP", async () => {
    const { status, body } = await api<{ status: string }>("GET", "/health");
    expect(status).toBe(200);
    expect(body).toEqual({ status: "ok" });
  });

  it("full user journey: create users → confirmed tx → pending tx → approve → reject → list", async () => {
    const aliceRes = await api<UserBody>("POST", "/api/users", {
      body: {
        name: "Alice E2E",
        email: `alice-${Date.now()}@e2e.local`,
        initialBalance: "200000",
      },
    });
    expect(aliceRes.status).toBe(201);
    const alice = aliceRes.body;
    expect(alice.balance).toBe("200000.00");

    const bobRes = await api<UserBody>("POST", "/api/users", {
      body: {
        name: "Bob E2E",
        email: `bob-${Date.now()}@e2e.local`,
        initialBalance: "0",
      },
    });
    expect(bobRes.status).toBe(201);
    const bob = bobRes.body;

    // Approvals require an admin caller. `role` isn't exposed through the
    // public API on purpose, so we create the user via HTTP and promote it
    // via a direct DB write — same trick the tests helpers use.
    const adminRes = await api<UserBody>("POST", "/api/users", {
      body: {
        name: "Admin E2E",
        email: `admin-${Date.now()}@e2e.local`,
        initialBalance: "0",
      },
    });
    expect(adminRes.status).toBe(201);
    const admin = adminRes.body;
    await app.knex("users").where({ id: admin.id }).update({ role: "admin" });

    // 1) Confirmed tx (amount <= 50k)
    const txAutoKey = uniqueKey("e2e-auto");
    const txAuto = await api<TransactionBody>("POST", "/api/transactions", {
      userId: alice.id,
      body: {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "1000.25",
        idempotencyKey: txAutoKey,
      },
    });
    expect(txAuto.status).toBe(201);
    expect(txAuto.body.status).toBe("confirmed");
    expect(txAuto.body.amount).toBe("1000.25");

    // Idempotency: same key returns the same tx with 200
    const retry = await api<TransactionBody>("POST", "/api/transactions", {
      userId: alice.id,
      body: {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "1000.25",
        idempotencyKey: txAutoKey,
      },
    });
    expect(retry.status).toBe(200);
    expect(retry.body.id).toBe(txAuto.body.id);

    // 2) Pending tx (amount > 50k)
    const txPendKey = uniqueKey("e2e-pend");
    const txPend = await api<TransactionBody>("POST", "/api/transactions", {
      userId: alice.id,
      body: {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "60000",
        idempotencyKey: txPendKey,
      },
    });
    expect(txPend.status).toBe(201);
    expect(txPend.body.status).toBe("pending");
    expect(txPend.body.confirmedAt).toBeNull();

    // Balances not touched yet
    const aliceMid = await api<UserBody>("GET", `/api/users/${alice.id}`);
    expect(aliceMid.body.balance).toBe("198999.75"); // 200000 - 1000.25

    // 3) Approve the pending — approvals are admin-only
    const approved = await api<TransactionBody>(
      "PATCH",
      `/api/transactions/${txPend.body.id}/approve`,
      { userId: admin.id },
    );
    expect(approved.status).toBe(200);
    expect(approved.body.status).toBe("confirmed");

    const aliceAfterApprove = await api<UserBody>("GET", `/api/users/${alice.id}`);
    expect(aliceAfterApprove.body.balance).toBe("138999.75"); // 198999.75 - 60000

    const bobAfterApprove = await api<UserBody>("GET", `/api/users/${bob.id}`);
    expect(bobAfterApprove.body.balance).toBe("61000.25"); // 1000.25 + 60000

    // 4) Create another pending and reject it
    const rejectKey = uniqueKey("e2e-rej");
    const toReject = await api<TransactionBody>("POST", "/api/transactions", {
      userId: alice.id,
      body: {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "70000",
        idempotencyKey: rejectKey,
      },
    });
    expect(toReject.status).toBe(201);
    expect(toReject.body.status).toBe("pending");

    const rejected = await api<TransactionBody>(
      "PATCH",
      `/api/transactions/${toReject.body.id}/reject`,
      { userId: admin.id },
    );
    expect(rejected.status).toBe(200);
    expect(rejected.body.status).toBe("rejected");

    // Balances should be unchanged from after-approve
    const aliceAfterReject = await api<UserBody>("GET", `/api/users/${alice.id}`);
    expect(aliceAfterReject.body.balance).toBe("138999.75");

    // 5) Listing filtered by alice: should see 3 txs (1 confirmed, 1 confirmed, 1 rejected)
    const list = await api<{
      data: TransactionBody[];
      pagination: { total: number; limit: number; offset: number };
    }>("GET", `/api/transactions?userId=${alice.id}`, { userId: alice.id });
    expect(list.status).toBe(200);
    expect(list.body.pagination.total).toBe(3);
    const statuses = list.body.data.map((t) => t.status).sort();
    expect(statuses).toEqual(["confirmed", "confirmed", "rejected"]);
  });

  it("returns a well-formed JSON error envelope over real HTTP", async () => {
    const { status, body } = await api<{
      error: string;
      message: string;
      requestId?: string;
    }>("GET", "/api/transactions/not-a-uuid", { userId: "anyone" });
    expect(status).toBe(400);
    expect(body.error).toBe("VALIDATION_ERROR");
    expect(typeof body.requestId).toBe("string");
  });

  it("401 when x-user-id is missing on protected routes", async () => {
    const { status, body } = await api<{ error: string }>(
      "GET",
      "/api/transactions",
    );
    expect(status).toBe(401);
    expect(body.error).toBe("UNAUTHORIZED");
  });
});
