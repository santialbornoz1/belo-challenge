import { Model } from "objection";

/**
 * We rely on Knex-level snake_case mappers (configured in db.plugin.ts
 * via `wrapIdentifier` + `postProcessResponse`), which translates camelCase
 * <-> snake_case everywhere — including query builder strings (where,
 * orderBy, returning, etc.). Model-level `snakeCaseMappers` only maps data
 * and misses identifiers inside queries, so we keep this base thin.
 */
export class BaseModel extends Model {}
