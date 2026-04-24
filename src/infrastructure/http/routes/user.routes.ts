import type { FastifyInstance } from "fastify";
import { ObjectionUserRepository } from "../../repositories/objection-user.repository";
import {
  CreateUserUseCaseImpl,
  type CreateUserUseCase,
} from "../../../application/use-cases/create-user.use-case";
import {
  createUserSchema,
  type CreateUserBody,
  listUsersSchema,
  type ListUsersQuery,
  userIdParamsSchema,
  type UserIdParams,
} from "../schemas/user.schema";
import { UserNotFoundError } from "../../../domain/errors";

export async function userRoutes(fastify: FastifyInstance): Promise<void> {
  const userRepo = new ObjectionUserRepository();
  const createUser: CreateUserUseCase = new CreateUserUseCaseImpl(userRepo);

  fastify.post<{ Body: CreateUserBody }>(
    "/",
    { schema: createUserSchema },
    async (req, reply) => {
      const user = await createUser.execute(req.body);
      return reply.status(201).send(serialize(user));
    },
  );

  fastify.get<{ Querystring: ListUsersQuery }>(
    "/",
    { schema: listUsersSchema },
    async (req) => {
      const limit = req.query.limit ?? 100;
      const offset = req.query.offset ?? 0;
      const users = await userRepo.list(limit, offset);
      return { data: users.map(serialize) };
    },
  );

  fastify.get<{ Params: UserIdParams }>(
    "/:id",
    { schema: userIdParamsSchema },
    async (req) => {
      const user = await userRepo.findById(req.params.id);
      if (!user) throw new UserNotFoundError(req.params.id);
      return serialize(user);
    },
  );
}

function serialize(u: {
  id: string;
  name: string;
  email: string;
  balance: string;
  role: "user" | "admin";
  createdAt: Date;
  updatedAt: Date;
}) {
  return {
    id: u.id,
    name: u.name,
    email: u.email,
    balance: String(u.balance),
    role: u.role,
    createdAt: u.createdAt.toISOString(),
    updatedAt: u.updatedAt.toISOString(),
  };
}
