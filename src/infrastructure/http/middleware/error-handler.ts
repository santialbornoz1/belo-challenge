import type { FastifyInstance, FastifyError, FastifyReply, FastifyRequest } from "fastify";
import { AppError } from "../../../domain/errors";

interface ErrorPayload {
  error: string;
  message: string;
  details?: unknown;
  requestId?: string;
}

function send(reply: FastifyReply, status: number, body: ErrorPayload) {
  return reply.status(status).send(body);
}

/**
 * Fastify error codes we care about translating to friendlier responses.
 * https://www.fastify.io/docs/latest/Reference/Errors/
 */
const FST_ERR_CODES = new Set([
  "FST_ERR_CTP_INVALID_MEDIA_TYPE",
  "FST_ERR_CTP_EMPTY_JSON_BODY",
  "FST_ERR_CTP_BODY_TOO_LARGE",
  "FST_ERR_VALIDATION",
]);

export function registerErrorHandler(app: FastifyInstance): void {
  // 404 for unknown routes
  app.setNotFoundHandler((request: FastifyRequest, reply: FastifyReply) => {
    return send(reply, 404, {
      error: "ROUTE_NOT_FOUND",
      message: `Route ${request.method} ${request.url} not found`,
      requestId: request.id,
    });
  });

  app.setErrorHandler((error: FastifyError, request: FastifyRequest, reply: FastifyReply) => {
    // 1. Domain errors — known, typed.
    if (error instanceof AppError) {
      return send(reply, error.statusCode, {
        error: error.code,
        message: error.message,
        ...(error.details ? { details: error.details } : {}),
        requestId: request.id,
      });
    }

    // 2. Fastify schema validation.
    if (error.validation) {
      const details = humanizeValidationErrors(error.validation, error.validationContext);
      return send(reply, 400, {
        error: "VALIDATION_ERROR",
        message: details[0]?.message ?? "Invalid request",
        details,
        requestId: request.id,
      });
    }

    // 3. JSON parse / empty body / content-type issues.
    if (error.code === "FST_ERR_CTP_EMPTY_JSON_BODY") {
      return send(reply, 400, {
        error: "EMPTY_BODY",
        message: "Request body is required",
        requestId: request.id,
      });
    }
    if (error.code === "FST_ERR_CTP_INVALID_MEDIA_TYPE") {
      return send(reply, 415, {
        error: "UNSUPPORTED_MEDIA_TYPE",
        message: error.message,
        requestId: request.id,
      });
    }
    if (error.code === "FST_ERR_CTP_BODY_TOO_LARGE") {
      return send(reply, 413, {
        error: "PAYLOAD_TOO_LARGE",
        message: error.message,
        requestId: request.id,
      });
    }
    if (
      typeof error.message === "string" &&
      error.message.toLowerCase().includes("json") &&
      error.statusCode === 400
    ) {
      return send(reply, 400, {
        error: "MALFORMED_JSON",
        message: "Request body is not valid JSON",
        requestId: request.id,
      });
    }

    // 4. Any other Fastify-raised 4xx we respect.
    if (error.statusCode && error.statusCode >= 400 && error.statusCode < 500) {
      return send(reply, error.statusCode, {
        error: error.code && !FST_ERR_CODES.has(error.code) ? error.code : "BAD_REQUEST",
        message: error.message,
        requestId: request.id,
      });
    }

    // 5. DB-level errors that weren't mapped upstream — log full detail
    //    (code, constraint, detail) but never leak internals to the client.
    const dbInfo = extractDbInfo(error);
    request.log.error(
      {
        err: error,
        stack: error.stack,
        ...(dbInfo ? { pg: dbInfo } : {}),
        path: request.url,
        method: request.method,
      },
      "unhandled_error",
    );

    return send(reply, 500, {
      error: "INTERNAL_ERROR",
      message: "An unexpected error occurred",
      requestId: request.id,
    });
  });
}

interface AjvLikeError {
  instancePath?: string;
  schemaPath?: string;
  keyword?: string;
  message?: string;
  params?: Record<string, unknown>;
}

interface ValidationDetail {
  location: "body" | "query" | "params" | "headers";
  field: string;
  message: string;
}

const LOCATION_MAP: Record<string, ValidationDetail["location"]> = {
  body: "body",
  querystring: "query",
  params: "params",
  headers: "headers",
};

function humanizeValidationErrors(
  errors: unknown,
  context?: string,
): ValidationDetail[] {
  if (!Array.isArray(errors)) return [];
  const location = LOCATION_MAP[context ?? ""] ?? "body";
  return errors.map((e: AjvLikeError) => {
    const field = fieldFromError(e);
    return {
      location,
      field,
      message: messageFromError(e, field),
    };
  });
}

function fieldFromError(e: AjvLikeError): string {
  if (e.keyword === "required") {
    const missing = (e.params as { missingProperty?: string } | undefined)?.missingProperty;
    if (missing) {
      const prefix = e.instancePath ? e.instancePath.replace(/^\//, "").replace(/\//g, ".") : "";
      return prefix ? `${prefix}.${missing}` : missing;
    }
  }
  const path = (e.instancePath ?? "").replace(/^\//, "").replace(/\//g, ".");
  return path || "(root)";
}

function messageFromError(e: AjvLikeError, field: string): string {
  switch (e.keyword) {
    case "required":
      return `${field} is required`;
    case "format": {
      const fmt = (e.params as { format?: string } | undefined)?.format;
      return fmt === "uuid"
        ? `${field} must be a valid UUID`
        : `${field} must match format ${fmt ?? "unknown"}`;
    }
    case "type": {
      const type = (e.params as { type?: string } | undefined)?.type;
      return `${field} must be of type ${type ?? "unknown"}`;
    }
    case "pattern":
      return `${field} has an invalid format`;
    case "enum": {
      const allowed = (e.params as { allowedValues?: unknown[] } | undefined)?.allowedValues;
      return allowed
        ? `${field} must be one of: ${allowed.join(", ")}`
        : `${field} has an invalid value`;
    }
    case "minimum":
    case "exclusiveMinimum":
    case "maximum":
    case "exclusiveMaximum":
    case "minLength":
    case "maxLength":
      return `${field} ${e.message ?? "is out of range"}`;
    case "additionalProperties": {
      const extra = (e.params as { additionalProperty?: string } | undefined)?.additionalProperty;
      return extra ? `Unknown field: ${extra}` : "Unknown field";
    }
    default:
      return e.message ? `${field} ${e.message}` : `${field} is invalid`;
  }
}

function extractDbInfo(err: unknown): Record<string, unknown> | null {
  if (!err || typeof err !== "object") return null;
  const e = err as {
    code?: string;
    constraint?: string;
    detail?: string;
    table?: string;
    column?: string;
    nativeError?: { code?: string; constraint?: string; detail?: string; table?: string; column?: string };
  };
  const native = e.nativeError;
  const code = e.code ?? native?.code;
  if (!code || !/^\d{5}$/.test(code)) return null;
  return {
    code,
    constraint: e.constraint ?? native?.constraint,
    detail: e.detail ?? native?.detail,
    table: e.table ?? native?.table,
    column: e.column ?? native?.column,
  };
}
