const uuidParams = {
  type: "object",
  required: ["id"],
  additionalProperties: false,
  properties: {
    id: {
      type: "string",
      format: "uuid",
      description: "UUID v4 de la transacción.",
    },
  },
} as const;

const authSecurity = [{ UserIdHeader: [] }] as const;

export const createTransactionSchema = {
  tags: ["Transactions"],
  summary: "Crear transacción",
  description:
    "Crea una transferencia P2P. Si `amount <= 50000` el servidor bloquea ambos usuarios, valida fondos y mueve los saldos atómicamente (status `confirmed`). Si `amount > 50000` se guarda con status `pending` para `approve`/`reject` manual y los saldos NO se tocan.\n\n**Idempotencia:** un `idempotencyKey` repetido devuelve la transacción original con `200 OK` (no se crea duplicado). Un unique constraint en la DB actúa como red de seguridad ante race conditions y se manifiesta como `409 DUPLICATE_IDEMPOTENCY_KEY`.",
  security: authSecurity,
  body: {
    type: "object",
    required: ["fromUserId", "toUserId", "amount", "idempotencyKey"],
    additionalProperties: false,
    properties: {
      fromUserId: {
        type: "string",
        format: "uuid",
        description: "UUID del emisor. Debe ser distinto de `toUserId`.",
      },
      toUserId: {
        type: "string",
        format: "uuid",
        description: "UUID del receptor. Debe ser distinto de `fromUserId`.",
      },
      amount: {
        type: "string",
        pattern: "^\\d+(\\.\\d{1,2})?$",
        description:
          "Monto en ARS como string decimal con hasta 2 decimales. Debe ser > 0. Siempre string para preservar precisión.",
        examples: ["1500.50", "60000"],
      },
      idempotencyKey: {
        type: "string",
        minLength: 1,
        maxLength: 128,
        description:
          "Clave única elegida por el cliente por cada operación lógica. Reutilizarla devuelve la transacción original.",
        examples: ["payment-2026-04-24-abc"],
      },
    },
  },
  response: {
    200: {
      description: "Hit de idempotencia — ya existía una transacción con ese `idempotencyKey`.",
      $ref: "Transaction#",
    },
    201: {
      description:
        "Transacción creada. `status` es `confirmed` para montos ≤ 50000 con fondos suficientes, `pending` en caso contrario.",
      $ref: "Transaction#",
    },
    400: {
      description:
        "Error de validación. `error` es uno de: `VALIDATION_ERROR` (falla de JSON Schema), `INVALID_AMOUNT` (cero), `SAME_USER` (`fromUserId === toUserId`).",
      $ref: "ErrorResponse#",
    },
    401: {
      description: "Falta el header `x-user-id` o es inválido.",
      $ref: "ErrorResponse#",
    },
    404: {
      description: "El usuario `from` o `to` no existe.",
      $ref: "ErrorResponse#",
    },
    409: {
      description:
        "Red de seguridad ante race condition: el `idempotencyKey` fue usado por un request concurrente.",
      $ref: "ErrorResponse#",
    },
    422: {
      description: "Sólo para transacciones auto-confirmadas (amount ≤ 50000): el emisor no tiene fondos.",
      $ref: "ErrorResponse#",
    },
  },
} as const;

export interface CreateTransactionBody {
  fromUserId: string;
  toUserId: string;
  amount: string;
  idempotencyKey: string;
}

export const listTransactionsSchema = {
  tags: ["Transactions"],
  summary: "Listar transacciones",
  description:
    "Devuelve transacciones donde el `userId` dado sea emisor o receptor, ordenadas por `createdAt DESC` y paginadas. Si se omite `userId`, se devuelven todas las transacciones visibles para el caller (estilo admin).",
  security: authSecurity,
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      userId: {
        type: "string",
        format: "uuid",
        description: "Filtro: emisor O receptor igual a este usuario.",
      },
      status: {
        type: "string",
        enum: ["pending", "confirmed", "rejected"],
        description: "Filtrar por status.",
      },
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 20,
        description: "Máximo 100. Por defecto 20.",
      },
      offset: {
        type: "integer",
        minimum: 0,
        default: 0,
        description: "Cantidad de filas a saltear.",
      },
    },
  },
  response: {
    200: {
      description: "Lista paginada.",
      type: "object",
      required: ["data", "pagination"],
      properties: {
        data: {
          type: "array",
          items: { $ref: "Transaction#" },
        },
        pagination: { $ref: "Pagination#" },
      },
    },
    401: {
      description: "Falta el header `x-user-id` o es inválido.",
      $ref: "ErrorResponse#",
    },
  },
} as const;

export interface ListTransactionsQuery {
  userId?: string;
  status?: "pending" | "confirmed" | "rejected";
  limit?: number;
  offset?: number;
}

export const getTransactionSchema = {
  tags: ["Transactions"],
  summary: "Obtener transacción por id",
  description: "Devuelve una única transacción.",
  security: authSecurity,
  params: uuidParams,
  response: {
    200: { description: "Encontrada.", $ref: "Transaction#" },
    401: { description: "Falta el header `x-user-id` o es inválido.", $ref: "ErrorResponse#" },
    404: { description: "No existe ninguna transacción con ese id.", $ref: "ErrorResponse#" },
  },
} as const;

export const approveTransactionSchema = {
  tags: ["Transactions"],
  summary: "Aprobar una transacción pending",
  description:
    "Confirma una transacción `pending` y mueve los saldos atómicamente. El servidor bloquea la fila de la transacción (`FOR UPDATE`), re-valida que el status siga siendo `pending`, bloquea ambos usuarios ordenados por id, **re-valida** que el emisor aún tenga fondos (el saldo pudo haber cambiado desde que se creó la pending), y luego debita, acredita, marca `confirmed` y escribe el log de auditoría — todo en la misma transacción de DB.",
  security: authSecurity,
  params: uuidParams,
  response: {
    200: { description: "Transacción confirmada.", $ref: "Transaction#" },
    401: { description: "Falta el header `x-user-id` o es inválido.", $ref: "ErrorResponse#" },
    404: {
      description: "`TRANSACTION_NOT_FOUND` — no existe ninguna transacción con ese id.",
      $ref: "ErrorResponse#",
    },
    409: {
      description:
        "`INVALID_TRANSACTION_STATE` — la transacción ya no está en status `pending`.",
      $ref: "ErrorResponse#",
    },
    422: {
      description: "`INSUFFICIENT_FUNDS` — el saldo cambió y ya no alcanza para cubrir el monto.",
      $ref: "ErrorResponse#",
    },
  },
} as const;

export const rejectTransactionSchema = {
  tags: ["Transactions"],
  summary: "Rechazar una transacción pending",
  description:
    "Marca una transacción `pending` como `rejected`. NO toca los saldos. Mismos errores que approve, menos el `422` (no hace falta chequear saldo en el rechazo).",
  security: authSecurity,
  params: uuidParams,
  response: {
    200: { description: "Transacción rechazada.", $ref: "Transaction#" },
    401: { description: "Falta el header `x-user-id` o es inválido.", $ref: "ErrorResponse#" },
    404: {
      description: "`TRANSACTION_NOT_FOUND` — no existe ninguna transacción con ese id.",
      $ref: "ErrorResponse#",
    },
    409: {
      description:
        "`INVALID_TRANSACTION_STATE` — la transacción ya no está en status `pending`.",
      $ref: "ErrorResponse#",
    },
  },
} as const;

export interface TransactionIdParams {
  id: string;
}

// Kept for backwards compatibility with imports — now an alias.
export const transactionIdParamsSchema = getTransactionSchema;
