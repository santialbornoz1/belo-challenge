import Knex, { type Knex as KnexType } from "knex";
import { Model, knexSnakeCaseMappers } from "objection";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";

declare module "fastify" {
  interface FastifyInstance {
    knex: KnexType;
  }
}

export interface DbPluginOptions {
  connectionString?: string;
}

export function createKnex(connectionString?: string): KnexType {
  const cs =
    connectionString ??
    process.env.DATABASE_URL ??
    "postgresql://belo:belo123@localhost:5432/belo_challenge";

  return Knex({
    client: "pg",
    connection: cs,
    pool: { min: 2, max: 10 },
    ...knexSnakeCaseMappers(),
  });
}

async function dbPluginImpl(fastify: FastifyInstance, opts: DbPluginOptions) {
  const knex = createKnex(opts.connectionString);
  Model.knex(knex);

  fastify.decorate("knex", knex);
  fastify.addHook("onClose", async () => {
    await knex.destroy();
  });
}

export const dbPlugin = fp(dbPluginImpl, { name: "db-plugin" });
