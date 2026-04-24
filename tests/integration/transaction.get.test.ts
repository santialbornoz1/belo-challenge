import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  postTransaction,
  uniqueKey,
} from "../helpers";

describe("GET /api/transactions/:id", () => {
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

  it("returns 200 with the serialized transaction", async () => {
    const alice = await seedUser(app, { balance: "1000" });
    const bob = await seedUser(app, { balance: "0" });
    const created = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "10",
      idempotencyKey: uniqueKey("g-ok"),
    });
    expect(created.statusCode).toBe(201);
    const id = created.json().id;

    const res = await app.inject({
      method: "GET",
      url: `/api/transactions/${id}`,
      headers: { "x-user-id": alice.id },
    });
    expect(res.statusCode).toBe(200);
    const body = res.json();
    expect(body.id).toBe(id);
    expect(body.fromUser).toEqual({ id: alice.id, name: alice.name, email: alice.email });
    expect(body.toUser).toEqual({ id: bob.id, name: bob.name, email: bob.email });
    expect(body.amount).toBe("10.00");
    expect(body.status).toBe("confirmed");
    expect(typeof body.createdAt).toBe("string");
    expect(typeof body.confirmedAt).toBe("string");
    expect(body.rejectedAt).toBeNull();
  });

  it("returns 404 TRANSACTION_NOT_FOUND for an unknown id", async () => {
    const alice = await seedUser(app, { balance: "0" });
    const res = await app.inject({
      method: "GET",
      url: `/api/transactions/00000000-0000-0000-0000-000000000000`,
      headers: { "x-user-id": alice.id },
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("TRANSACTION_NOT_FOUND");
  });

  it("returns 401 when x-user-id header is missing", async () => {
    const res = await app.inject({
      method: "GET",
      url: `/api/transactions/00000000-0000-0000-0000-000000000000`,
    });
    expect(res.statusCode).toBe(401);
    expect(res.json().error).toBe("UNAUTHORIZED");
  });

  it("returns 400 VALIDATION_ERROR when the id is not a UUID", async () => {
    const alice = await seedUser(app, { balance: "0" });
    const res = await app.inject({
      method: "GET",
      url: `/api/transactions/not-a-uuid`,
      headers: { "x-user-id": alice.id },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});
