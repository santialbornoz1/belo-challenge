import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  seedAdmin,
  postTransaction,
  listTransactions,
  uniqueKey,
} from "../helpers";

describe("GET /api/transactions — admin mode (no userId filter)", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await newApp();
  });
  afterAll(async () => {
    await app.close();
  });
  beforeEach(async () => {
    await truncateAll(app);
  });

  it("admin with no userId filter sees all transactions", async () => {
    const admin = await seedAdmin(app);
    const alice = await seedUser(app, { balance: "10000" });
    const bob = await seedUser(app, { balance: "10000" });
    const carol = await seedUser(app, { balance: "10000" });

    await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "10",
      idempotencyKey: uniqueKey("ad-1"),
    });
    await postTransaction(app, bob.id, {
      fromUserId: bob.id,
      toUserId: carol.id,
      amount: "20",
      idempotencyKey: uniqueKey("ad-2"),
    });

    const res = await listTransactions(app, admin.id);
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.total).toBe(2);
    expect(body.data.length).toBe(2);
  });

  it("non-admin without userId filter is rejected with 403", async () => {
    const alice = await seedUser(app, { balance: "0" });
    const res = await listTransactions(app, alice.id);
    expect(res.statusCode).toBe(403);
    expect(res.json().error).toBe("FORBIDDEN");
  });

  it("returns empty list when admin queries an empty DB", async () => {
    const admin = await seedAdmin(app);
    const res = await listTransactions(app, admin.id);
    expect(res.statusCode).toBe(200);
    expect(res.json().data).toEqual([]);
    expect(res.json().pagination).toEqual({ total: 0, limit: 20, offset: 0 });
  });

  it("rejects an invalid status enum value", async () => {
    const admin = await seedAdmin(app);
    const res = await listTransactions(app, admin.id, { status: "bogus" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects a negative offset", async () => {
    const admin = await seedAdmin(app);
    const res = await listTransactions(app, admin.id, { offset: -1 });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("requires x-user-id header", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/transactions",
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });
});
