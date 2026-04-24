import type { FastifyReply, FastifyRequest } from "fastify";
import type { UserRepository } from "../../../domain/ports/user.repository";
import type { UserRole } from "../../../domain/entities/user";
import { ForbiddenError, UnauthorizedError } from "../../../domain/errors";

export interface AuthenticatedUser {
  id: string;
  role: UserRole;
}

declare module "fastify" {
  interface FastifyRequest {
    user?: AuthenticatedUser;
    /** @deprecated use `request.user.id` */
    userId?: string;
  }
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AuthPreHandler = (req: FastifyRequest, reply: FastifyReply) => Promise<void>;

/**
 * Auth mock. Trusts the `x-user-id` header but — unlike a naive regex-only
 * check — verifies the caller actually exists in the database and loads
 * their role. In production this is replaced by a JWT plugin validating a
 * signed token; the rest of the app already depends on `request.user`, so
 * swapping the source is local.
 */
export function buildRequireUser(userRepo: UserRepository): AuthPreHandler {
  return async function requireUser(req: FastifyRequest, _reply: FastifyReply) {
    const raw = req.headers["x-user-id"];
    const header = Array.isArray(raw) ? raw[0] : raw;
    if (!header || typeof header !== "string" || header.trim().length === 0) {
      throw new UnauthorizedError("Missing or invalid x-user-id header");
    }
    const userId = header.trim();
    if (!UUID_RE.test(userId)) {
      throw new UnauthorizedError("x-user-id header must be a valid UUID");
    }

    const user = await userRepo.findById(userId);
    if (!user) {
      throw new UnauthorizedError("Unknown user");
    }

    req.user = { id: user.id, role: user.role };
    req.userId = user.id;
  };
}

export async function requireAdmin(req: FastifyRequest, _reply: FastifyReply): Promise<void> {
  if (!req.user) throw new UnauthorizedError();
  if (req.user.role !== "admin") throw new ForbiddenError("Admin role required");
}

export function isAdmin(user: AuthenticatedUser | undefined): user is AuthenticatedUser {
  return user?.role === "admin";
}
