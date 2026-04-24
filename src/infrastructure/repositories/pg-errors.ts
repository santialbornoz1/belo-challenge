/**
 * Shared helpers to map Postgres driver errors to domain errors.
 *
 * Objection wraps pg errors in `DBError`. The original pg error is exposed
 * in `nativeError`, and the fields we need (`code`, `constraint`, `detail`)
 * may exist on either side. We inspect both.
 */

export const PG_CODES = {
  UNIQUE_VIOLATION: "23505",
  FOREIGN_KEY_VIOLATION: "23503",
  CHECK_VIOLATION: "23514",
  NOT_NULL_VIOLATION: "23502",
} as const;

interface PgLikeError {
  code?: string;
  constraint?: string;
  detail?: string;
  nativeError?: {
    code?: string;
    constraint?: string;
    detail?: string;
  };
}

export function pgCode(err: unknown): string | undefined {
  if (!err || typeof err !== "object") return undefined;
  const e = err as PgLikeError;
  return e.code ?? e.nativeError?.code;
}

export function pgConstraint(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const e = err as PgLikeError;
  return e.constraint ?? e.nativeError?.constraint ?? "";
}

export function pgDetail(err: unknown): string {
  if (!err || typeof err !== "object") return "";
  const e = err as PgLikeError;
  return e.detail ?? e.nativeError?.detail ?? "";
}

export function isPgUniqueViolation(err: unknown, hint?: string): boolean {
  if (pgCode(err) !== PG_CODES.UNIQUE_VIOLATION) return false;
  if (!hint) return true;
  const c = pgConstraint(err);
  const d = pgDetail(err);
  return c.includes(hint) || d.includes(hint);
}

export function isPgCheckViolation(err: unknown, hint?: string): boolean {
  if (pgCode(err) !== PG_CODES.CHECK_VIOLATION) return false;
  if (!hint) return true;
  return pgConstraint(err).includes(hint);
}

export function isPgForeignKeyViolation(err: unknown): boolean {
  return pgCode(err) === PG_CODES.FOREIGN_KEY_VIOLATION;
}
