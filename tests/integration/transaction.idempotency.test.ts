import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  getBalance,
  postTransaction,
  uniqueKey,
} from "../helpers";

describe("POST /api/transactions — idempotency", () => {
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

  it("returns the original transaction with 200 (not 201) when the key repeats", async () => {
    const alice = await seedUser(app, { balance: "1000" });
    const bob = await seedUser(app, { balance: "0" });
    const key = uniqueKey("idem-1");

    const first = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "100",
      idempotencyKey: key,
    });
    expect(first.statusCode).toBe(201);
    const firstBody = first.json();

    const second = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "100",
      idempotencyKey: key,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().id).toBe(firstBody.id);

    // funds moved only ONCE
    expect(await getBalance(app, alice.id)).toBe("900.00");
    expect(await getBalance(app, bob.id)).toBe("100.00");
  });

  it("returns the same original tx even if the retry has a different amount (prevents double-spend)", async () => {
    // Classic scenario: retry client resends the same key but — maybe because
    // of a client bug — with a different body. We must NOT create a second tx.
    const alice = await seedUser(app, { balance: "1000" });
    const bob = await seedUser(app, { balance: "0" });
    const key = uniqueKey("idem-tamper");

    const first = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "100",
      idempotencyKey: key,
    });
    expect(first.statusCode).toBe(201);

    const second = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "999", // tampered
      idempotencyKey: key,
    });
    expect(second.statusCode).toBe(200);
    expect(second.json().amount).toBe("100.00"); // still the original
  });

  it("is safe under a race: concurrent requests with same key produce exactly one tx", async () => {
    const alice = await seedUser(app, { balance: "1000" });
    const bob = await seedUser(app, { balance: "0" });
    const key = uniqueKey("idem-race");

    const payload = {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "100",
      idempotencyKey: key,
    };

    // Fire 5 concurrent requests with the same idempotency key
    const responses = await Promise.all(
      Array.from({ length: 5 }, () => postTransaction(app, alice.id, payload)),
    );

    // All must be success: one 201 (the winner) and the rest 200 (idempotent
    // hits). The TransferService catches the UNIQUE violation from the race
    // and reloads the winning tx, so no honest retrier sees a 409.
    const statusCounts = responses.reduce<Record<number, number>>((acc, r) => {
      acc[r.statusCode] = (acc[r.statusCode] ?? 0) + 1;
      return acc;
    }, {});
    expect(statusCounts[201]).toBe(1);
    expect(statusCounts[200]).toBe(responses.length - 1);

    // Exactly ONE confirmed tx should exist in DB
    const { rows } = await app.knex.raw(
      'SELECT COUNT(*)::int AS n FROM transactions WHERE idempotency_key = ?',
      [key],
    );
    expect(rows[0].n).toBe(1);

    // And funds moved exactly once
    expect(await getBalance(app, alice.id)).toBe("900.00");
    expect(await getBalance(app, bob.id)).toBe("100.00");
  });
});
