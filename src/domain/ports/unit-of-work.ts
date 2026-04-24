import type { DomainTrx } from "./audit.repository";

/**
 * Abstracts a DB transaction so the application layer can orchestrate
 * multi-repo atomic operations without knowing about the underlying
 * driver (knex, pg, etc). The `trx` handle passed to the callback is
 * opaque — callers simply thread it to every repository call meant to
 * participate in the same transaction.
 *
 * If the callback throws, the transaction is rolled back. If it resolves,
 * it commits.
 */
export interface UnitOfWork {
  runInTransaction<T>(work: (trx: DomainTrx) => Promise<T>): Promise<T>;
}
