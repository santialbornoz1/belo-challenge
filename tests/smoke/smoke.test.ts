import type { FastifyInstance } from "fastify";
import {
  newApp,
  truncateAll,
  seedUser,
  postTransaction,
  uniqueKey,
} from "../helpers";

/**
 * Smoke tests — the shortest path through each critical surface. These should
 * catch showstoppers (DB down, migrations missing, Swagger broken, /health
 * failing, happy path regressed) in < 3 seconds. If a smoke test fails the
 * deploy is blocked.
 */
describe("smoke — critical paths", () => {
  let app: FastifyInstance;

  beforeAll(async () => {
    app = await newApp();
    await truncateAll(app);
  });
  afterAll(async () => {
    await app.close();
  });

  it("/health responds 200 with { status: 'ok' }", async () => {
    const res = await app.inject({ method: "GET", url: "/health" });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ status: "ok" });
  });

  it("/docs/json exposes a well-formed OpenAPI 3 spec", async () => {
    const res = await app.inject({ method: "GET", url: "/docs/json" });
    expect(res.statusCode).toBe(200);
    const spec = res.json();
    expect(spec.openapi).toMatch(/^3\./);
    expect(spec.info.title).toBeDefined();
    expect(spec.paths["/api/users/"]).toBeDefined();
    expect(spec.paths["/api/transactions/"]).toBeDefined();
    expect(spec.paths["/api/transactions/{id}/approve"]).toBeDefined();
    expect(spec.paths["/health"]).toBeDefined();
  });

  it("happy path: create user → create confirmed tx → read it back", async () => {
    const alice = await seedUser(app, { balance: "1000" });
    const bob = await seedUser(app, { balance: "0" });

    const created = await postTransaction(app, alice.id, {
      fromUserId: alice.id,
      toUserId: bob.id,
      amount: "42.50",
      idempotencyKey: uniqueKey("smoke-happy"),
    });
    expect(created.statusCode).toBe(201);
    expect(created.json().status).toBe("confirmed");

    const id = created.json().id;
    const got = await app.inject({
      method: "GET",
      url: `/api/transactions/${id}`,
      headers: { "x-user-id": alice.id },
    });
    expect(got.statusCode).toBe(200);
    expect(got.json().id).toBe(id);
    expect(got.json().amount).toBe("42.50");

    const aliceAfter = await app.inject({
      method: "GET",
      url: `/api/users/${alice.id}`,
    });
    expect(aliceAfter.json().balance).toBe("957.50");
  });

  it("DB is reachable (select 1)", async () => {
    const { rows } = await app.knex.raw<{ rows: { one: number }[] }>(
      "SELECT 1 AS one",
    );
    expect(rows[0].one).toBe(1);
  });
});
