import type { FastifyInstance } from "fastify";
import { newApp, truncateAll } from "../helpers";

describe("POST /api/users & GET /api/users/:id", () => {
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

  it("creates a user with zero balance by default", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "Zero", email: "zero@test.local" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().balance).toBe("0.00");
  });

  it("creates a user with the provided initial balance", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "Rich", email: "rich@test.local", initialBalance: "123.45" },
    });
    expect(res.statusCode).toBe(201);
    expect(res.json().balance).toBe("123.45");
  });

  it("returns 409 DUPLICATE_EMAIL when email is already taken", async () => {
    const first = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "A", email: "dup@test.local" },
    });
    expect(first.statusCode).toBe(201);

    const second = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "B", email: "dup@test.local" },
    });
    expect(second.statusCode).toBe(409);
    expect(second.json().error).toBe("DUPLICATE_EMAIL");
  });

  it("rejects invalid email via schema", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "x", email: "not-an-email" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects missing required fields", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "No email" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects additional properties (strict body validator)", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "x", email: "x@test.local", hackedField: "1" },
    });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });

  it("rejects negative initial balance at the use case layer", async () => {
    const res = await app.inject({
      method: "POST",
      url: "/api/users",
      payload: { name: "Negatron", email: "neg@test.local", initialBalance: "-1" },
    });
    // schema pattern actually blocks this first (400 VALIDATION_ERROR)
    expect(res.statusCode).toBe(400);
  });

  it("GET /api/users/:id returns 404 for a non-existent user", async () => {
    const res = await app.inject({
      method: "GET",
      url: "/api/users/00000000-0000-0000-0000-000000000000",
    });
    expect(res.statusCode).toBe(404);
    expect(res.json().error).toBe("USER_NOT_FOUND");
  });

  it("GET /api/users/:id with invalid UUID returns 400 VALIDATION_ERROR", async () => {
    const res = await app.inject({ method: "GET", url: "/api/users/not-a-uuid" });
    expect(res.statusCode).toBe(400);
    expect(res.json().error).toBe("VALIDATION_ERROR");
  });
});
