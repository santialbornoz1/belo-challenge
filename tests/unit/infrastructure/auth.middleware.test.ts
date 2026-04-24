import {
  buildRequireUser,
  requireAdmin,
  isAdmin,
} from "../../../src/infrastructure/http/middleware/auth.middleware";
import { ForbiddenError, UnauthorizedError } from "../../../src/domain/errors";
import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRepository } from "../../../src/domain/ports/user.repository";
import type { User, UserRole } from "../../../src/domain/entities/user";

function req(headers: Record<string, unknown>): FastifyRequest {
  return { headers } as unknown as FastifyRequest;
}
const reply = {} as FastifyReply;

const UUID_A = "11111111-1111-4111-8111-111111111111";
const UUID_B = "22222222-2222-4222-8222-222222222222";
const UUID_UNKNOWN = "99999999-9999-4999-8999-999999999999";

function mockUser(id: string, role: UserRole = "user"): User {
  return {
    id,
    name: "Test",
    email: `${id.slice(0, 8)}@test.local`,
    balance: "0.00",
    role,
    createdAt: new Date(),
    updatedAt: new Date(),
  };
}

function mockRepo(users: Record<string, User> = {}): UserRepository {
  return {
    create: jest.fn(),
    findById: jest.fn(async (id: string) => users[id] ?? null),
    findByEmail: jest.fn(),
    list: jest.fn(),
    findByIdsForUpdate: jest.fn(),
    updateBalance: jest.fn(),
  };
}

describe("buildRequireUser middleware", () => {
  it("sets request.user and request.userId when header is a valid UUID of an existing user", async () => {
    const user = mockUser(UUID_A, "user");
    const requireUser = buildRequireUser(mockRepo({ [UUID_A]: user }));

    const r = req({ "x-user-id": UUID_A });
    await requireUser(r, reply);

    expect(r.user).toEqual({ id: UUID_A, role: "user" });
    expect(r.userId).toBe(UUID_A);
  });

  it("picks the first value when header is an array", async () => {
    const user = mockUser(UUID_A);
    const requireUser = buildRequireUser(mockRepo({ [UUID_A]: user }));

    const r = req({ "x-user-id": [UUID_A, UUID_B] });
    await requireUser(r, reply);

    expect(r.user?.id).toBe(UUID_A);
  });

  it("throws UnauthorizedError when the header is missing", async () => {
    const requireUser = buildRequireUser(mockRepo());
    await expect(requireUser(req({}), reply)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the header is empty or whitespace", async () => {
    const requireUser = buildRequireUser(mockRepo());
    await expect(requireUser(req({ "x-user-id": "" }), reply)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(requireUser(req({ "x-user-id": "   " }), reply)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(requireUser(req({ "x-user-id": [] }), reply)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws UnauthorizedError when the header is not a valid UUID", async () => {
    const requireUser = buildRequireUser(mockRepo());
    const r = req({ "x-user-id": "user-123" });
    await expect(requireUser(r, reply)).rejects.toThrow(/must be a valid UUID/);
  });

  it("throws UnauthorizedError when the UUID doesn't match any existing user", async () => {
    const requireUser = buildRequireUser(mockRepo()); // empty repo
    const r = req({ "x-user-id": UUID_UNKNOWN });
    await expect(requireUser(r, reply)).rejects.toBeInstanceOf(UnauthorizedError);
    await expect(requireUser(r, reply)).rejects.toThrow(/Unknown user/);
  });

  it("exposes the user's role", async () => {
    const user = mockUser(UUID_A, "admin");
    const requireUser = buildRequireUser(mockRepo({ [UUID_A]: user }));
    const r = req({ "x-user-id": UUID_A });
    await requireUser(r, reply);
    expect(r.user?.role).toBe("admin");
  });

  it("does not mutate other request properties", async () => {
    const user = mockUser(UUID_A);
    const requireUser = buildRequireUser(mockRepo({ [UUID_A]: user }));
    const r = req({ "x-user-id": UUID_A, "x-other": "y" });
    await requireUser(r, reply);
    expect((r.headers as Record<string, unknown>)["x-other"]).toBe("y");
  });
});

describe("requireAdmin", () => {
  it("throws UnauthorizedError when req.user is absent", async () => {
    const r = { user: undefined } as unknown as FastifyRequest;
    await expect(requireAdmin(r, reply)).rejects.toBeInstanceOf(UnauthorizedError);
  });

  it("throws ForbiddenError when role is 'user'", async () => {
    const r = { user: { id: "x", role: "user" as const } } as unknown as FastifyRequest;
    await expect(requireAdmin(r, reply)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("does nothing when role is 'admin'", async () => {
    const r = { user: { id: "x", role: "admin" as const } } as unknown as FastifyRequest;
    await expect(requireAdmin(r, reply)).resolves.toBeUndefined();
  });
});

describe("isAdmin helper", () => {
  it("returns true when user.role === 'admin'", () => {
    expect(isAdmin({ id: "x", role: "admin" })).toBe(true);
  });
  it("returns false otherwise", () => {
    expect(isAdmin({ id: "x", role: "user" })).toBe(false);
    expect(isAdmin(undefined)).toBe(false);
  });
});
