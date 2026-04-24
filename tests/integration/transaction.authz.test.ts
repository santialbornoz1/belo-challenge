import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  seedAdmin,
  postTransaction,
  approveTransaction,
  rejectTransaction,
  listTransactions,
  uniqueKey,
} from "../helpers";

/**
 * Authorization policies — who is allowed to do what on the transactions
 * API. These tests complement the (implicit) positive cases scattered
 * across the other integration suites.
 *
 * Rules:
 *   POST /api/transactions           — fromUserId must match caller OR caller is admin
 *   GET  /api/transactions           — no filter → admin only
 *                                     userId filter for someone else → admin only
 *                                     userId filter matching caller → allowed
 *   GET  /api/transactions/:id       — admin OR caller is party to the tx
 *   PATCH /:id/approve, /:id/reject  — admin only
 */
describe("authorization policies on /api/transactions", () => {
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

  describe("POST /api/transactions", () => {
    it("non-admin cannot create a tx on behalf of someone else (403)", async () => {
      const alice = await seedUser(app, { balance: "1000" });
      const bob = await seedUser(app, { balance: "1000" });
      const mallory = await seedUser(app, { balance: "0" });

      // Mallory tries to spend Alice's money by impersonating the sender in the body.
      const res = await postTransaction(app, mallory.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "100",
        idempotencyKey: uniqueKey("authz-impersonate"),
      });

      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("FORBIDDEN");
    });

    it("admin can create a tx on behalf of another user", async () => {
      const alice = await seedUser(app, { balance: "1000" });
      const bob = await seedUser(app, { balance: "0" });
      const admin = await seedAdmin(app);

      const res = await postTransaction(app, admin.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "100",
        idempotencyKey: uniqueKey("authz-admin-create"),
      });

      expect(res.statusCode).toBe(201);
    });
  });

  describe("GET /api/transactions/:id", () => {
    it("sender can read the tx they created", async () => {
      const alice = await seedUser(app, { balance: "1000" });
      const bob = await seedUser(app, { balance: "0" });
      const created = await postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "10",
        idempotencyKey: uniqueKey("authz-sender-read"),
      });
      const id = created.json().id;

      const res = await app.inject({
        method: "GET",
        url: `/api/transactions/${id}`,
        headers: { "x-user-id": alice.id },
      });
      expect(res.statusCode).toBe(200);
    });

    it("receiver can read a tx they received", async () => {
      const alice = await seedUser(app, { balance: "1000" });
      const bob = await seedUser(app, { balance: "0" });
      const created = await postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "10",
        idempotencyKey: uniqueKey("authz-receiver-read"),
      });
      const id = created.json().id;

      const res = await app.inject({
        method: "GET",
        url: `/api/transactions/${id}`,
        headers: { "x-user-id": bob.id },
      });
      expect(res.statusCode).toBe(200);
    });

    it("third party (not sender/receiver, not admin) is forbidden (403)", async () => {
      const alice = await seedUser(app, { balance: "1000" });
      const bob = await seedUser(app, { balance: "0" });
      const mallory = await seedUser(app, { balance: "0" });
      const created = await postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "10",
        idempotencyKey: uniqueKey("authz-third-party"),
      });
      const id = created.json().id;

      const res = await app.inject({
        method: "GET",
        url: `/api/transactions/${id}`,
        headers: { "x-user-id": mallory.id },
      });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("FORBIDDEN");
    });

    it("admin can read any tx", async () => {
      const alice = await seedUser(app, { balance: "1000" });
      const bob = await seedUser(app, { balance: "0" });
      const admin = await seedAdmin(app);
      const created = await postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "10",
        idempotencyKey: uniqueKey("authz-admin-read"),
      });

      const res = await app.inject({
        method: "GET",
        url: `/api/transactions/${created.json().id}`,
        headers: { "x-user-id": admin.id },
      });
      expect(res.statusCode).toBe(200);
    });
  });

  describe("GET /api/transactions (listing)", () => {
    it("non-admin cannot list tx of another user (403)", async () => {
      const alice = await seedUser(app, { balance: "1000" });
      const bob = await seedUser(app, { balance: "0" });
      await postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "10",
        idempotencyKey: uniqueKey("authz-list-other"),
      });

      const res = await listTransactions(app, bob.id, { userId: alice.id });
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("FORBIDDEN");
    });

    it("non-admin can list their own tx", async () => {
      const alice = await seedUser(app, { balance: "1000" });
      const bob = await seedUser(app, { balance: "0" });
      await postTransaction(app, alice.id, {
        fromUserId: alice.id,
        toUserId: bob.id,
        amount: "10",
        idempotencyKey: uniqueKey("authz-list-own"),
      });

      const res = await listTransactions(app, alice.id, { userId: alice.id });
      expect(res.statusCode).toBe(200);
      expect(res.json().pagination.total).toBe(1);
    });
  });

  describe("PATCH /:id/approve and /:id/reject", () => {
    async function createPending() {
      const from = await seedUser(app, { balance: "100000" });
      const to = await seedUser(app, { balance: "0" });
      const created = await postTransaction(app, from.id, {
        fromUserId: from.id,
        toUserId: to.id,
        amount: "60000",
        idempotencyKey: uniqueKey("authz-pending"),
      });
      return { from, to, id: created.json().id };
    }

    it("non-admin cannot approve, even as the sender (403)", async () => {
      const { from, id } = await createPending();
      const res = await approveTransaction(app, from.id, id);
      expect(res.statusCode).toBe(403);
      expect(res.json().error).toBe("FORBIDDEN");
    });

    it("non-admin cannot approve, even as the receiver (403)", async () => {
      const { to, id } = await createPending();
      const res = await approveTransaction(app, to.id, id);
      expect(res.statusCode).toBe(403);
    });

    it("non-admin cannot reject (403)", async () => {
      const { from, id } = await createPending();
      const res = await rejectTransaction(app, from.id, id);
      expect(res.statusCode).toBe(403);
    });

    it("admin can approve", async () => {
      const { id } = await createPending();
      const admin = await seedAdmin(app);
      const res = await approveTransaction(app, admin.id, id);
      expect(res.statusCode).toBe(200);
    });

    it("admin can reject", async () => {
      const { id } = await createPending();
      const admin = await seedAdmin(app);
      const res = await rejectTransaction(app, admin.id, id);
      expect(res.statusCode).toBe(200);
    });
  });

  describe("authN mock — UUID must correspond to an existing user", () => {
    it("rejects a valid-looking UUID that doesn't match any user (401)", async () => {
      const phantom = "99999999-9999-4999-8999-999999999999";
      const res = await app.inject({
        method: "GET",
        url: "/api/transactions",
        headers: { "x-user-id": phantom },
      });
      expect(res.statusCode).toBe(401);
      expect(res.json().error).toBe("UNAUTHORIZED");
      expect(res.json().message).toMatch(/Unknown user/);
    });
  });
});
