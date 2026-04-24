import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  seedAdmin,
  getBalance,
  postTransaction,
  approveTransaction,
  rejectTransaction,
  uniqueKey,
} from "../helpers";

describe("PATCH /api/transactions/:id/approve and /:id/reject", () => {
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

  async function createPending(fromBal = "100000", toBal = "0", amount = "60000") {
    const from = await seedUser(app, { balance: fromBal });
    const to = await seedUser(app, { balance: toBal });
    const res = await postTransaction(app, from.id, {
      fromUserId: from.id,
      toUserId: to.id,
      amount,
      idempotencyKey: uniqueKey("ar-pending"),
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().status).toBe("pending");
    return { from, to, tx: res.json() };
  }

  describe("approve", () => {
    it("confirms a pending tx and moves funds atomically", async () => {
      const { from, to, tx } = await createPending();
      const admin = await seedAdmin(app);

      const res = await approveTransaction(app, admin.id, tx.id);
      expect(res.statusCode).toBe(200);
      const updated = res.json();
      expect(updated.status).toBe("confirmed");
      expect(updated.confirmedAt).not.toBeNull();

      expect(await getBalance(app, from.id)).toBe("40000.00");
      expect(await getBalance(app, to.id)).toBe("60000.00");
    });

    it("re-validates funds on approve: if balance changed and no longer covers the tx, returns 422", async () => {
      // Critical test: between creating the pending and approving it,
      // the sender's balance may change. Approve MUST re-check.
      const { from, to, tx } = await createPending("60000", "0", "60000");
      const admin = await seedAdmin(app);

      // Consume most of alice's balance via an auto-confirmed tx
      const thirdParty = await seedUser(app, { balance: "0" });
      const drain = await postTransaction(app, from.id, {
        fromUserId: from.id,
        toUserId: thirdParty.id,
        amount: "40000", // alice now has 20000 left
        idempotencyKey: uniqueKey("ar-drain"),
      });
      expect(drain.statusCode).toBe(201);
      expect(await getBalance(app, from.id)).toBe("20000.00");

      // Now approve should fail because 20000 < 60000
      const res = await approveTransaction(app, admin.id, tx.id);
      expect(res.statusCode).toBe(422);
      expect(res.json().error).toBe("INSUFFICIENT_FUNDS");

      // Balances unchanged by the failed approve
      expect(await getBalance(app, from.id)).toBe("20000.00");
      expect(await getBalance(app, to.id)).toBe("0.00");

      // And the pending tx must still be pending (not confirmed or rejected)
      const getTx = await app.inject({
        method: "GET",
        url: `/api/transactions/${tx.id}`,
        headers: { "x-user-id": from.id },
      });
      expect(getTx.json().status).toBe("pending");
    });

    it("returns 404 TRANSACTION_NOT_FOUND when the id does not exist", async () => {
      const admin = await seedAdmin(app);
      const res = await approveTransaction(
        app,
        admin.id,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(res.statusCode).toBe(404);
      expect(res.json().error).toBe("TRANSACTION_NOT_FOUND");
    });

    it("returns 409 INVALID_TRANSACTION_STATE when approving an already-confirmed tx", async () => {
      const { from, to, tx } = await createPending();
      const admin = await seedAdmin(app);

      const first = await approveTransaction(app, admin.id, tx.id);
      expect(first.statusCode).toBe(200);

      const second = await approveTransaction(app, admin.id, tx.id);
      expect(second.statusCode).toBe(409);
      expect(second.json().error).toBe("INVALID_TRANSACTION_STATE");

      // balances reflect only one approval
      expect(await getBalance(app, from.id)).toBe("40000.00");
      expect(await getBalance(app, to.id)).toBe("60000.00");
    });

    it("returns 409 INVALID_TRANSACTION_STATE when approving an already-rejected tx", async () => {
      const { tx } = await createPending();
      const admin = await seedAdmin(app);

      const r = await rejectTransaction(app, admin.id, tx.id);
      expect(r.statusCode).toBe(200);

      const approveAgain = await approveTransaction(app, admin.id, tx.id);
      expect(approveAgain.statusCode).toBe(409);
      expect(approveAgain.json().error).toBe("INVALID_TRANSACTION_STATE");
    });

    it("rejects approve of a tx that was auto-confirmed (was never pending)", async () => {
      const from = await seedUser(app, { balance: "10000" });
      const to = await seedUser(app, { balance: "0" });
      const admin = await seedAdmin(app);
      const created = await postTransaction(app, from.id, {
        fromUserId: from.id,
        toUserId: to.id,
        amount: "100",
        idempotencyKey: uniqueKey("ar-auto"),
      });
      expect(created.json().status).toBe("confirmed");

      const res = await approveTransaction(app, admin.id, created.json().id);
      expect(res.statusCode).toBe(409);
    });
  });

  describe("reject", () => {
    it("marks a pending tx as rejected without touching balances", async () => {
      const { from, to, tx } = await createPending();
      const admin = await seedAdmin(app);

      const before = {
        from: await getBalance(app, from.id),
        to: await getBalance(app, to.id),
      };

      const res = await rejectTransaction(app, admin.id, tx.id);
      expect(res.statusCode).toBe(200);
      const updated = res.json();
      expect(updated.status).toBe("rejected");
      expect(updated.rejectedAt).not.toBeNull();

      expect(await getBalance(app, from.id)).toBe(before.from);
      expect(await getBalance(app, to.id)).toBe(before.to);
    });

    it("returns 409 when rejecting a non-pending tx", async () => {
      const { tx } = await createPending();
      const admin = await seedAdmin(app);

      const first = await rejectTransaction(app, admin.id, tx.id);
      expect(first.statusCode).toBe(200);

      const second = await rejectTransaction(app, admin.id, tx.id);
      expect(second.statusCode).toBe(409);
    });

    it("returns 404 when rejecting a non-existent tx", async () => {
      const admin = await seedAdmin(app);
      const res = await rejectTransaction(
        app,
        admin.id,
        "00000000-0000-0000-0000-000000000000",
      );
      expect(res.statusCode).toBe(404);
    });
  });

  describe("audit trail", () => {
    it("writes an audit_log row for each state transition", async () => {
      const { from, to, tx } = await createPending();
      const admin = await seedAdmin(app);

      await approveTransaction(app, admin.id, tx.id);

      const { rows } = await app.knex.raw(
        `SELECT action FROM audit_logs WHERE entity_id = ? ORDER BY created_at ASC`,
        [tx.id],
      );
      const actions = rows.map((r: { action: string }) => r.action);
      expect(actions).toEqual(["TRANSACTION_PENDING_CREATED", "TRANSACTION_APPROVED"]);

      // Sanity: balances consistent
      expect(await getBalance(app, from.id)).toBe("40000.00");
      expect(await getBalance(app, to.id)).toBe("60000.00");
    });
  });
});
