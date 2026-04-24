import { readFileSync } from "node:fs";
import { join } from "node:path";
import fp from "fastify-plugin";
import type { FastifyInstance } from "fastify";
import swagger from "@fastify/swagger";
import swaggerUi from "@fastify/swagger-ui";
import { sharedSchemas } from "../schemas/shared.schema";

const beloLogo = readFileSync(join(__dirname, "../assets/belo-logo.png"));

const API_TITLE = "Belo Backend Challenge — Mini Plataforma Fintech";
const API_VERSION = "1.0.0";
const API_DESCRIPTION = `
API REST para transferencias P2P internas en ARS entre usuarios de la plataforma.

## Puntos destacados
- **Atomicidad**: toda operación que toca saldos corre dentro de una misma transacción de base de datos (débito + crédito + log de auditoría).
- **Concurrencia**: \`SELECT ... FOR UPDATE\` sobre usuarios, locks ordenados por id para evitar deadlocks.
- **Precisión**: todos los montos son \`NUMERIC(20,2)\` en Postgres y \`string\` decimal en la API — nunca números JSON.
- **Idempotencia**: todo create acepta un \`idempotencyKey\`; los repetidos devuelven la transacción original con \`200 OK\`.
- **Regla de auto-aprobación**: \`amount <= 50000\` se auto-confirma. Por encima → \`pending\` para aprobación/rechazo manual.

## Autenticación
Todos los endpoints de \`/api/transactions\` requieren el header \`x-user-id: <uuid>\` (auth mockeada — reemplaza a un JWT real).
Hacé click en el botón **Authorize** arriba a la derecha y pegá un UUID de usuario para probar las rutas protegidas.

## Formato de error
\`\`\`json
{ "error": "STABLE_CODE", "message": "Human readable", "details": { }, "requestId": "uuid" }
\`\`\`

Bifurcá según \`error\` (máquina), logueá \`message\` (humano), correlacioná con \`requestId\`.
`.trim();

async function swaggerSetup(app: FastifyInstance): Promise<void> {
  for (const schema of sharedSchemas) {
    app.addSchema(schema);
  }

  await app.register(swagger, {
    refResolver: {
      // Keep the $id as the component name so refs render as
      // `#/components/schemas/ErrorResponse` instead of auto-numbered `def-N`.
      buildLocalReference(json, _baseUri, _fragment, i) {
        const id = (json as { $id?: string }).$id;
        return id && typeof id === "string" ? id : `def-${i}`;
      },
    },
    openapi: {
      openapi: "3.0.3",
      info: {
        title: API_TITLE,
        description: API_DESCRIPTION,
        version: API_VERSION,
        contact: {
          name: "Santiago Albornoz",
          email: "santi.albornoz156@gmail.com",
        },
        license: {
          name: "MIT",
        },
      },
      servers: [
        { url: "http://localhost:3001", description: "Desarrollo local" },
      ],
      tags: [
        {
          name: "Users",
          description: "Crear y consultar usuarios. El saldo vive en el registro del usuario.",
        },
        {
          name: "Transactions",
          description:
            "Transferencias P2P. Auto-confirmadas por debajo de 50k, pending por encima. Soporta idempotencia, aprobación, rechazo y listado con filtros.",
        },
        {
          name: "Health",
          description: "Liveness probe. No verifica la DB (agregar `/health/ready` para eso en producción).",
        },
      ],
      components: {
        securitySchemes: {
          UserIdHeader: {
            type: "apiKey",
            in: "header",
            name: "x-user-id",
            description:
              "Auth mockeada: UUID del caller. En producción esto se reemplazaría por un JWT validado por `@fastify/jwt`.",
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: "/docs",
    uiConfig: {
      docExpansion: "list",
      deepLinking: true,
      displayRequestDuration: true,
      tryItOutEnabled: true,
      persistAuthorization: true,
      filter: true,
    },
    logo: {
      type: "image/png",
      content: beloLogo,
      href: "https://belo.app",
      target: "_blank",
    },
    theme: {
      title: "Belo Backend Challenge — Documentación de la API",
      favicon: [
        {
          filename: "favicon.png",
          rel: "icon",
          type: "image/png",
          sizes: "400x222",
          content: beloLogo,
        },
      ],
    },
    staticCSP: true,
  });
}

export const swaggerPlugin = fp(swaggerSetup, {
  name: "swagger-plugin",
  fastify: "5.x",
});
