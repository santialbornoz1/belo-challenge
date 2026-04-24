import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  postTransaction,
  listTransactions,
  uniqueKey,
} from "../helpers";

describe("GET /api/transactions — listing & filtering", () => {
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

  it("lists tx where the user is the sender OR the receiver, ordered by createdAt DESC", async () => {
    const alice = await seedUser(app, { balance: "10000" });
    const bob = await seedUser(app, { balance: "10000" });
    const carol = await seedUser(app, { balance: "10000" });

    // alice -> bob (alice as sender)
    const t1 = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "10",
      idempotencyKey: uniqueKey("l-1"),
    });
    // bob -> carol (NOT involving alice)
    const t2 = await postTransaction(app, bob.id, {
      fromUserId: bob.id,
      toUserId: carol.id,
      amount: "20",
      idempotencyKey: uniqueKey("l-2"),
    });
    // carol -> alice (alice as receiver)
    const t3 = await postTransaction(app, carol.id, {
      fromUserId: carol.id,
      toUserId: alice.id,
      amount: "30",
      idempotencyKey: uniqueKey("l-3"),
    });
    expect([t1, t2, t3].every((r) => r.statusCode === 201)).toBe(true);

    const res = await listTransactions(app, alice.id, { userId: alice.id });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.pagination.total).toBe(2);
    const ids = body.data.map((x: { id: string }) => x.id);
    expect(ids).toEqual([t3.json().id, t1.json().id]); // DESC by createdAt
  });

  it("filters by status", async () => {
    const alice = await seedUser(app, { balance: "500000" });
    const bob = await seedUser(app, { balance: "0" });

    await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "100",
      idempotencyKey: uniqueKey("ls-1"),
    });
    await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "60000", // pending
      idempotencyKey: uniqueKey("ls-2"),
    });

    const confirmed = await listTransactions(app, alice.id, {
      userId: alice.id,
      status: "confirmed",
    });
    expect(confirmed.json().pagination.total).toBe(1);

    const pending = await listTransactions(app, alice.id, {
      userId: alice.id,
      status: "pending",
    });
    expect(pending.json().pagination.total).toBe(1);

    const rejected = await listTransactions(app, alice.id, {
      userId: alice.id,
      status: "rejected",
    });
    expect(rejected.json().pagination.total).toBe(0);
  });

  it("respects limit and offset pagination", async () => {
    const alice = await seedUser(app, { balance: "10000" });
    const bob = await seedUser(app, { balance: "0" });

    for (let i = 0; i < 5; i++) {
      await postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "10",
        idempotencyKey: uniqueKey(`lp-${i}`),
      });
    }

    const page1 = await listTransactions(app, alice.id, {
      userId: alice.id,
      limit: 2,
      offset: 0,
    });
    expect(page1.json().data.length).toBe(2);
    expect(page1.json().pagination.total).toBe(5);

    const page2 = await listTransactions(app, alice.id, {
      userId: alice.id,
      limit: 2,
      offset: 2,
    });
    expect(page2.json().data.length).toBe(2);

    const page3 = await listTransactions(app, alice.id, {
      userId: alice.id,
      limit: 2,
      offset: 4,
    });
    expect(page3.json().data.length).toBe(1);
  });

  it("clamps invalid limits (handled by schema or use case)", async () => {
    const alice = await seedUser(app, { balance: "0" });

    // limit > 100 → rejected by schema
    const over = await listTransactions(app, alice.id, {
      userId: alice.id,
      limit: 9999,
    });
    expect(over.statusCode).toBe(400);
    expect(over.json().error).toBe("VALIDATION_ERROR");
  });
});
