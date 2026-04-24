import type { AuditLog, CreateAuditLogInput } from "../entities/audit-log";

/**
 * Opaque transaction handle passed between domain ports so that an audit
 * write can participate in the same unit of work as the operation that
 * triggered it. The domain doesn't know how to construct or interpret it —
 * only adapters do. This keeps the domain free of infrastructure types
 * (knex, pg, etc).
 */
declare const domainTrxBrand: unique symbol;
export interface DomainTrx {
  readonly [domainTrxBrand]: never;
}

export interface AuditRepository {
  /**
   * Writes an audit log. If `trx` is passed, the write participates in the
   * caller's unit of work (use this when the audit entry must be atomic
   * with the operation — "outbox-lite" within the same DB). If omitted,
   * it's a standalone write.
   */
  log(input: CreateAuditLogInput, trx?: DomainTrx): Promise<void>;

  findByEntity(entity: string, entityId: string): Promise<AuditLog[]>;
}
