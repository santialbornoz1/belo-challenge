import Fastify, { type FastifyInstance } from "fastify";
import cors from "@fastify/cors";
import { dbPlugin } from "./infrastructure/http/plugins/db.plugin";
import { swaggerPlugin } from "./infrastructure/http/plugins/swagger.plugin";
import { registerErrorHandler } from "./infrastructure/http/middleware/error-handler";
import { registerValidators } from "./infrastructure/http/validators";
import { userRoutes } from "./infrastructure/http/routes/user.routes";
import { transactionRoutes } from "./infrastructure/http/routes/transaction.routes";

export interface BuildAppOptions {
  connectionString?: string;
  logger?: boolean;
}

export async function buildApp(opts: BuildAppOptions = {}): Promise<FastifyInstance> {
  const app = Fastify({
    logger: opts.logger ?? { level: process.env.LOG_LEVEL ?? "info" },
    genReqId: () => crypto.randomUUID(),
    trustProxy: true,
  });

  registerValidators(app);

  await app.register(cors, { origin: true });
  await app.register(dbPlugin, { connectionString: opts.connectionString });
  await app.register(swaggerPlugin);

  registerErrorHandler(app);

  app.get(
    "/health",
    {
      schema: {
        tags: ["Health"],
        summary: "Liveness probe",
        description:
          "Devuelve `{ status: \"ok\" }` sin tocar la DB. En producción agregar `/health/ready` para readiness (ping a la DB).",
        response: {
          200: { $ref: "HealthResponse#" },
        },
      },
    },
    async () => ({ status: "ok" }),
  );

  await app.register(userRoutes, { prefix: "/api/users" });
  await app.register(transactionRoutes, { prefix: "/api/transactions" });

  return app;
}
