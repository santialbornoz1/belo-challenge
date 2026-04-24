import Ajv from "ajv";
import addFormats from "ajv-formats";
import type { FastifyInstance } from "fastify";

/**
 * Registers validator compilers with different AJV options depending on
 * the HTTP part:
 *
 * - body:        strict (no coercion). "amount": 100 (number) is rejected —
 *                clients must send "amount": "100" to preserve precision.
 * - querystring: HTTP query is always string, so coerce "10" -> 10 for
 *                integer fields. Without this, `?limit=10` would fail.
 * - params:      same as querystring (URL path segments are strings).
 * - headers:     same as querystring.
 *
 * All compilers reject unknown properties (`additionalProperties: false`)
 * and surface every error (`allErrors`) so the client sees the full list.
 */
export function registerValidators(app: FastifyInstance): void {
  const strict = new Ajv({
    removeAdditional: false,
    useDefaults: true,
    coerceTypes: false,
    allErrors: true,
  });
  addFormats(strict);

  const lenient = new Ajv({
    removeAdditional: false,
    useDefaults: true,
    coerceTypes: true,
    allErrors: true,
  });
  addFormats(lenient);

  app.setValidatorCompiler(({ schema, httpPart }) => {
    switch (httpPart) {
      case "body":
        return strict.compile(schema);
      case "querystring":
      case "params":
      case "headers":
        return lenient.compile(schema);
      default:
        return strict.compile(schema);
    }
  });
}
