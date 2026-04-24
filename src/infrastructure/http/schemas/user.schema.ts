export const createUserSchema = {
  tags: ["Users"],
  summary: "Crear usuario",
  description:
    "Crea un nuevo usuario con un saldo inicial opcional. Los emails son únicos — los duplicados devuelven `409 EMAIL_ALREADY_EXISTS`. `initialBalance` por defecto es `\"0.00\"` y debe ser un string decimal (nunca un número JSON) para preservar precisión.",
  body: {
    type: "object",
    required: ["name", "email"],
    additionalProperties: false,
    properties: {
      name: {
        type: "string",
        minLength: 1,
        maxLength: 255,
        description: "Nombre visible. No vacío, máximo 255 caracteres.",
        examples: ["Alice Demo"],
      },
      email: {
        type: "string",
        format: "email",
        maxLength: 255,
        description: "Dirección de email única.",
        examples: ["alice@demo.com"],
      },
      initialBalance: {
        type: "string",
        pattern: "^\\d+(\\.\\d{1,2})?$",
        description:
          "Saldo inicial opcional en ARS como string decimal con hasta 2 decimales. Por defecto `\"0.00\"`.",
        examples: ["100000.00"],
      },
    },
  },
  response: {
    201: {
      description: "Usuario creado.",
      $ref: "User#",
    },
    400: {
      description: "Falló la validación (email inválido, decimal inválido, propiedades extras, etc).",
      $ref: "ErrorResponse#",
    },
    409: {
      description: "Ya existe una cuenta con ese email.",
      $ref: "ErrorResponse#",
    },
  },
} as const;

export interface CreateUserBody {
  name: string;
  email: string;
  initialBalance?: string;
}

export const listUsersSchema = {
  tags: ["Users"],
  summary: "Listar usuarios",
  description:
    "Devuelve todos los usuarios del sistema ordenados por fecha de creación (más recientes primero). Pensado para UIs internas / onboarding donde hay que mostrar la lista completa de cuentas. Paginado.",
  querystring: {
    type: "object",
    additionalProperties: false,
    properties: {
      limit: {
        type: "integer",
        minimum: 1,
        maximum: 100,
        default: 100,
        description: "Máximo 100. Por defecto 100.",
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
      description: "Lista de usuarios.",
      type: "object",
      required: ["data"],
      properties: {
        data: { type: "array", items: { $ref: "User#" } },
      },
    },
  },
} as const;

export interface ListUsersQuery {
  limit?: number;
  offset?: number;
}

export const userIdParamsSchema = {
  tags: ["Users"],
  summary: "Obtener usuario por id",
  description: "Devuelve el usuario incluyendo el saldo actual.",
  params: {
    type: "object",
    required: ["id"],
    additionalProperties: false,
    properties: {
      id: {
        type: "string",
        format: "uuid",
        description: "UUID v4 del usuario.",
      },
    },
  },
  response: {
    200: {
      description: "Usuario encontrado.",
      $ref: "User#",
    },
    404: {
      description: "No existe ningún usuario con ese id.",
      $ref: "ErrorResponse#",
    },
  },
} as const;

export interface UserIdParams {
  id: string;
}
