import Decimal from "decimal.js";
import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  getBalance,
  postTransaction,
  uniqueKey,
} from "../helpers";

describe("concurrency — SELECT ... FOR UPDATE prevents double-spending", () => {
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

  it("two simultaneous transfers that together exceed the balance: exactly one succeeds", async () => {
    // Alice has 100. Two concurrent transfers of 80 each. Both can't pass;
    // without row-level locking, both would read balance=100, both would
    // pass the check, and we'd end at -60. With FOR UPDATE, only one wins.
    const alice = await seedUser(app, { balance: "100" });
    const bob = await seedUser(app, { balance: "0" });
    const carol = await seedUser(app, { balance: "0" });

    const [r1, r2] = await Promise.all([
      postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "80",
        idempotencyKey: uniqueKey("c-1"),
      }),
      postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: carol.id,
        amount: "80",
        idempotencyKey: uniqueKey("c-2"),
      }),
    ]);

    const statuses = [r1.statusCode, r2.statusCode].sort();
    expect(statuses).toEqual([201, 422]);

    const errorResponse = r1.statusCode === 422 ? r1 : r2;
    expect(errorResponse.json().error).toBe("INSUFFICIENT_FUNDS");

    expect(await getBalance(app, alice.id)).toBe("20.00");
    // exactly one recipient got 80, the other got 0
    const bobBal = await getBalance(app, bob.id);
    const carolBal = await getBalance(app, carol.id);
    expect([bobBal, carolBal].sort()).toEqual(["0.00", "80.00"]);
  });

  it("many concurrent small transfers end up with a consistent final balance (no lost updates)", async () => {
    // With FOR UPDATE every concurrent tx is linearised. Sum of all debits
    // must equal (start - final) exactly, with no cent lost.
    const alice = await seedUser(app, { balance: "1000.00" });
    const bob = await seedUser(app, { balance: "0" });

    const N = 20;
    const amountEach = "10.00";

    const requests = Array.from({ length: N }, (_, i) =>
      postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: amountEach,
        idempotencyKey: uniqueKey(`c-par-${i}`),
      }),
    );
    const results = await Promise.all(requests);
    for (const r of results) {
      expect(r.statusCode).toBe(201);
    }

    const totalMoved = new Decimal(amountEach).mul(N).toFixed(2);
    const expectedAlice = new Decimal("1000").sub(totalMoved).toFixed(2);

    expect(await getBalance(app, alice.id)).toBe(expectedAlice);
    expect(await getBalance(app, bob.id)).toBe(totalMoved);
  });

  it("the bidirectional transfers A↔B do not deadlock (locks are acquired in a consistent order)", async () => {
    // Without ordered locking (always lock the lower id first), two
    // simultaneous transfers A→B and B→A would deadlock.
    const alice = await seedUser(app, { balance: "1000" });
    const bob = await seedUser(app, { balance: "1000" });

    const [r1, r2] = await Promise.all([
      postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "100",
        idempotencyKey: uniqueKey("c-dl-1"),
      }),
      postTransaction(app, bob.id, {
        fromUserId: bob.id,
        toUserId: alice.id,
        amount: "100",
        idempotencyKey: uniqueKey("c-dl-2"),
      }),
    ]);

    expect(r1.statusCode).toBe(201);
    expect(r2.statusCode).toBe(201);

    // Net zero: both had 1000, still have 1000 (+100 -100 = 0)
    expect(await getBalance(app, alice.id)).toBe("1000.00");
    expect(await getBalance(app, bob.id)).toBe("1000.00");
  });
});
