/**
 * Shared JSON Schemas registered via `fastify.addSchema()` so they appear
 * once in `components.schemas` of the generated OpenAPI document and can
 * be referenced by route schemas via `{ $ref: "<id>#" }`.
 */

export const errorResponseSchema = {
  $id: "ErrorResponse",
  type: "object",
  title: "ErrorResponse",
  description: "Envoltorio estándar de error devuelto por la API para todo 4xx/5xx.",
  required: ["error", "message"],
  properties: {
    error: {
      type: "string",
      description:
        "Código de error estable y machine-readable. Los clientes deberían bifurcar sobre esto, no sobre `message`.",
      examples: ["VALIDATION_ERROR", "INSUFFICIENT_FUNDS", "USER_NOT_FOUND"],
    },
    message: {
      type: "string",
      description: "Explicación legible para humanos. Útil para logs y UIs de desarrolladores.",
      examples: ["Insufficient funds"],
    },
    details: {
      oneOf: [
        {
          type: "object",
          additionalProperties: true,
          description: "Contexto estructurado como objeto (ej: ids involucrados en un error de dominio).",
        },
        {
          type: "array",
          description:
            "Array de errores de validación, uno por campo inválido. Presente sólo en `VALIDATION_ERROR`.",
          items: {
            type: "object",
            required: ["location", "field", "message"],
            additionalProperties: false,
            properties: {
              location: {
                type: "string",
                enum: ["body", "query", "params", "headers"],
                description: "Parte del request donde está el campo inválido.",
              },
              field: {
                type: "string",
                description: "Nombre del campo (dotted path si es anidado).",
                examples: ["fromUserId", "amount"],
              },
              message: {
                type: "string",
                description: "Mensaje legible para humanos.",
                examples: ["fromUserId must be a valid UUID"],
              },
            },
          },
        },
      ],
      description: "Contexto estructurado opcional (detalle de validación, ids involucrados, etc).",
    },
    requestId: {
      type: "string",
      format: "uuid",
      description: "UUID v4 asignado al request. Presente en cada response y en cada línea de log.",
    },
  },
} as const;

export const userResponseSchema = {
  $id: "User",
  type: "object",
  title: "User",
  description: "Un usuario de la plataforma. `balance` es el saldo actual en ARS como string decimal.",
  required: ["id", "name", "email", "balance", "role", "createdAt", "updatedAt"],
  properties: {
    id: {
      type: "string",
      format: "uuid",
      description: "UUID v4 asignado por el servidor al momento de la creación.",
    },
    name: { type: "string", examples: ["Alice Demo"] },
    email: { type: "string", format: "email", examples: ["alice@demo.com"] },
    balance: {
      type: "string",
      pattern: "^\\d+(\\.\\d{1,2})?$",
      description:
        "Saldo actual en ARS como string decimal con hasta 2 decimales. Siempre string para preservar precisión (nunca número JSON).",
      examples: ["100000.00"],
    },
    role: {
      type: "string",
      enum: ["user", "admin"],
      description:
        "Rol del usuario. `user` es el default; `admin` habilita aprobar/rechazar transferencias pending. No se expone forma pública de promover.",
    },
    createdAt: { type: "string", format: "date-time" },
    updatedAt: { type: "string", format: "date-time" },
  },
} as const;

export const transactionUserSchema = {
  $id: "TransactionUser",
  type: "object",
  title: "TransactionUser",
  description:
    "Vista reducida de un usuario embebida en una transacción (id, nombre, email). No incluye `balance` porque representaría un snapshot momentáneo engañoso dentro del contexto de una transacción histórica.",
  required: ["id", "name", "email"],
  properties: {
    id: { type: "string", format: "uuid" },
    name: { type: "string", examples: ["Alice Demo"] },
    email: { type: "string", format: "email", examples: ["alice@demo.com"] },
  },
} as const;

export const transactionResponseSchema = {
  $id: "Transaction",
  type: "object",
  title: "Transaction",
  description:
    "Una transferencia P2P interna. Auto-confirmada si `amount <= 50000`, en caso contrario queda en `pending` para aprobación/rechazo manual. Incluye los usuarios origen (`fromUser`) y destino (`toUser`) embebidos para evitar tener que hacer lookups extra.",
  required: ["id", "fromUser", "toUser", "amount", "status", "createdAt"],
  properties: {
    id: { type: "string", format: "uuid" },
    fromUser: { $ref: "TransactionUser#" },
    toUser: { $ref: "TransactionUser#" },
    amount: {
      type: "string",
      pattern: "^\\d+(\\.\\d{1,2})?$",
      description: "String decimal con hasta 2 decimales. Siempre string (no número JSON).",
      examples: ["1500.50"],
    },
    status: {
      type: "string",
      enum: ["pending", "confirmed", "rejected"],
      description:
        "`confirmed`: los saldos ya se movieron. `pending`: espera aprobación/rechazo, saldos sin tocar. `rejected`: estado terminal, saldos sin tocar.",
    },
    createdAt: { type: "string", format: "date-time" },
    confirmedAt: {
      type: ["string", "null"],
      format: "date-time",
      description: "Se setea cuando el status pasa a `confirmed`. Null en caso contrario.",
    },
    rejectedAt: {
      type: ["string", "null"],
      format: "date-time",
      description: "Se setea cuando el status pasa a `rejected`. Null en caso contrario.",
    },
  },
} as const;

export const paginationSchema = {
  $id: "Pagination",
  type: "object",
  title: "Pagination",
  required: ["total", "limit", "offset"],
  properties: {
    total: { type: "integer", minimum: 0, description: "Total de filas que matchean los filtros." },
    limit: { type: "integer", minimum: 1, maximum: 100, description: "Tamaño de página usado." },
    offset: { type: "integer", minimum: 0, description: "Offset aplicado." },
  },
} as const;

export const healthResponseSchema = {
  $id: "HealthResponse",
  type: "object",
  title: "HealthResponse",
  required: ["status"],
  properties: {
    status: { type: "string", enum: ["ok"], examples: ["ok"] },
  },
} as const;

export const sharedSchemas = [
  errorResponseSchema,
  userResponseSchema,
  transactionUserSchema,
  transactionResponseSchema,
  paginationSchema,
  healthResponseSchema,
] as const;
