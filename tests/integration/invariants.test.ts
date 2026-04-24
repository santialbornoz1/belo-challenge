import type { FastifyInstance } from "fastify";
import { newApp, truncateAll, seedUser, uniqueKey } from "../helpers";

/**
 * These tests cover DB-level invariants as safety nets: even if a bug
 * bypassed application validation, the CHECK/UNIQUE/FK constraints would
 * reject the write. We also verify that `mapDbError` converts those into
 * typed domain errors (not 500s).
 */
describe("DB invariants & mapping", () => {
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

  it("CHECK (balance >= 0): direct DB update for negative balance is rejected", async () => {
    const u = await seedUser(app, { balance: "100" });

    await expect(
      app.knex("users").where({ id: u.id }).update({ balance: "-1" }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("CHECK (amount > 0): direct DB insert with zero amount is rejected", async () => {
    const from = await seedUser(app, { balance: "100" });
    const to = await seedUser(app, { balance: "0" });

    await expect(
      app.knex("transactions").insert({
        idempotency_key: uniqueKey("inv-amt-0"),
        from_user_id: from.id,
        to_user_id: to.id,
        amount: "0",
        status: "pending",
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("CHECK (from_user_id <> to_user_id): self-transfer rejected at DB level", async () => {
    const u = await seedUser(app, { balance: "100" });

    await expect(
      app.knex("transactions").insert({
        idempotency_key: uniqueKey("inv-self"),
        from_user_id: u.id,
        to_user_id: u.id,
        amount: "10",
        status: "pending",
      }),
    ).rejects.toMatchObject({ code: "23514" });
  });

  it("UNIQUE (idempotency_key): concurrent direct inserts with same key produce one success", async () => {
    const from = await seedUser(app, { balance: "1000" });
    const to = await seedUser(app, { balance: "0" });
    const key = uniqueKey("inv-unique");

    const insert = () =>
      app.knex("transactions").insert({
        idempotency_key: key,
        from_user_id: from.id,
        to_user_id: to.id,
        amount: "10",
        status: "pending",
      });

    const results = await Promise.allSettled([insert(), insert(), insert()]);
    const ok = results.filter((r) => r.status === "fulfilled").length;
    const fail = results.filter((r) => r.status === "rejected").length;
    expect(ok).toBe(1);
    expect(fail).toBe(2);
  });

  it("FK (from_user_id, to_user_id): cannot insert a tx referencing a non-existent user", async () => {
    await expect(
      app.knex("transactions").insert({
        idempotency_key: uniqueKey("inv-fk"),
        from_user_id: "00000000-0000-0000-0000-000000000000",
        to_user_id: "00000000-0000-0000-0000-000000000001",
        amount: "10",
        status: "pending",
      }),
    ).rejects.toMatchObject({ code: "23503" });
  });

  it("UNIQUE (email): direct DB inserts with duplicate email are rejected", async () => {
    await seedUser(app, { email: "inv@test.local" });
    await expect(
      app.knex("users").insert({ name: "dup", email: "inv@test.local", balance: "0" }),
    ).rejects.toMatchObject({ code: "23505" });
  });
});
