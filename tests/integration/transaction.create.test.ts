import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  seedAdmin,
  getBalance,
  postTransaction,
  uniqueKey,
} from "../helpers";

describe("POST /api/transactions — create (auto-approve threshold $50000)", () => {
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

  it("confirms and moves funds when amount <= 50000 (boundary: exactly 50000)", async () => {
    const alice = await seedUser(app, { balance: "100000" });
    const bob = await seedUser(app, { balance: "0" });

    const res = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "50000.00",
      idempotencyKey: uniqueKey("t-boundary-50k"),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("confirmed");
    expect(body.confirmedAt).not.toBeNull();
    expect(body.rejectedAt).toBeNull();

    expect(await getBalance(app, alice.id)).toBe("50000.00");
    expect(await getBalance(app, bob.id)).toBe("50000.00");
  });

  it("leaves pending and does NOT move funds when amount > 50000 (boundary: 50000.01)", async () => {
    const alice = await seedUser(app, { balance: "100000" });
    const bob = await seedUser(app, { balance: "0" });

    const res = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "50000.01",
      idempotencyKey: uniqueKey("t-over-threshold"),
    });

    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.status).toBe("pending");
    expect(body.confirmedAt).toBeNull();

    // balances unchanged
    expect(await getBalance(app, alice.id)).toBe("100000.00");
    expect(await getBalance(app, bob.id)).toBe("0.00");
  });

  it("confirms auto and preserves decimal precision with fractional amounts", async () => {
    const alice = await seedUser(app, { balance: "1000.00" });
    const bob = await seedUser(app, { balance: "0" });

    const res = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "0.10",
      idempotencyKey: uniqueKey("t-fractional"),
    });

    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("confirmed");
    expect(await getBalance(app, alice.id)).toBe("999.90");
    expect(await getBalance(app, bob.id)).toBe("0.10");
  });

  it("sums fractional amounts correctly across multiple transactions (no float drift)", async () => {
    const alice = await seedUser(app, { balance: "10.00" });
    const bob = await seedUser(app, { balance: "0" });

    for (let i = 0; i < 10; i++) {
      const r = await postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "0.10",
        idempotencyKey: uniqueKey(`t-drift-${i}`),
      });
      expect(r.statusCode).toBe(201);
    }

    // classic float trap: 0.1 * 10 !== 1.0 in IEEE754. With Decimal + NUMERIC it's exact.
    expect(await getBalance(app, alice.id)).toBe("9.00");
    expect(await getBalance(app, bob.id)).toBe("1.00");
  });

  it("rejects with 422 INSUFFICIENT_FUNDS when auto-approve and balance < amount", async () => {
    const alice = await seedUser(app, { balance: "100" });
    const bob = await seedUser(app, { balance: "0" });

    const res = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "200",
      idempotencyKey: uniqueKey("t-insuf"),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("INSUFFICIENT_FUNDS");

    // balances must not have been touched despite the in-transaction failure
    expect(await getBalance(app, alice.id)).toBe("100.00");
    expect(await getBalance(app, bob.id)).toBe("0.00");
  });

  it("rejects with 422 INSUFFICIENT_FUNDS when amount > 50000 and balance < amount (no pending created)", async () => {
    const alice = await seedUser(app, { balance: "100000" });
    const bob = await seedUser(app, { balance: "0" });

    const res = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "110000",
      idempotencyKey: uniqueKey("t-pending-low-bal"),
    });

    expect(res.statusCode).toBe(422);
    expect(res.json().error).toBe("INSUFFICIENT_FUNDS");
    expect(await getBalance(app, alice.id)).toBe("100000.00");
    expect(await getBalance(app, bob.id)).toBe("0.00");
  });

  it("returns 404 USER_NOT_FOUND when the sender doesn't exist", async () => {
    const bob = await seedUser(app, { balance: "0" });
    const admin = await seedAdmin(app);
    const fake = "00000000-0000-0000-0000-000000000000";

    // Admin acts on behalf so the policy check passes; repo then hits
    // the missing sender and surfaces 404.
    const res = await postTransaction(app, admin.id, {
      fromUserId: fake,
      toUserId: bob.id,
      amount: "10",
      idempotencyKey: uniqueKey("t-nofrom"),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("USER_NOT_FOUND");
  });

  it("returns 404 USER_NOT_FOUND when the receiver doesn't exist", async () => {
    const alice = await seedUser(app, { balance: "1000" });
    const fake = "00000000-0000-0000-0000-000000000000";

    const res = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: fake,
      amount: "10",
      idempotencyKey: uniqueKey("t-noto"),
    });

    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("USER_NOT_FOUND");
  });

  it("returns 400 SAME_USER when from and to are the same", async () => {
    const alice = await seedUser(app, { balance: "1000" });

    const res = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: alice.id,
      amount: "10",
      idempotencyKey: uniqueKey("t-same"),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("SAME_USER");
  });

  it("returns 400 INVALID_AMOUNT when amount is zero", async () => {
    const a = await seedUser(app, { balance: "1000" });
    const b = await seedUser(app, { balance: "0" });

    const res = await postTransaction(app, a.id, {
      fromUserId: a.id,
      toUserId: b.id,
      amount: "0",
      idempotencyKey: uniqueKey("t-zero"),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("INVALID_AMOUNT");
  });

  it("returns 400 VALIDATION_ERROR for negative amount (schema pattern)", async () => {
    const a = await seedUser(app, { balance: "1000" });
    const b = await seedUser(app, { balance: "0" });

    const res = await postTransaction(app, a.id, {
      fromUserId: a.id,
      toUserId: b.id,
      amount: "-100",
      idempotencyKey: uniqueKey("t-neg"),
    });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("returns 401 UNAUTHORIZED when x-user-id header is missing", async () => {
    const a = await seedUser(app, { balance: "1000" });
    const b = await seedUser(app, { balance: "0" });

    const res = await app.inject({
      method: "POST",
      url: "/api/transactions",
      headers: { "content-type": "application/json" },
      payload: {
        fromUserId: a.id,
        toUserId: b.id,
        amount: "10",
        idempotencyKey: uniqueKey("t-noauth"),
      },
    });

    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });
});
