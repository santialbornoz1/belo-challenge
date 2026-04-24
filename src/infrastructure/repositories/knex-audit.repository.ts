import type { Knex } from "knex";
import type { AuditRepository, DomainTrx } from "../../domain/ports/audit.repository";
import type { AuditLog, CreateAuditLogInput } from "../../domain/entities/audit-log";
import { AuditLogModel } from "../models/audit-log.model";

function toEntity(m: AuditLogModel): AuditLog {
  return {
    id: m.id,
    action: m.action,
    entity: m.entity,
    entityId: m.entityId,
    actorUserId: m.actorUserId,
    metadata: m.metadata ?? {},
    createdAt: new Date(m.createdAt),
  };
}

export class KnexAuditRepository implements AuditRepository {
  async log(input: CreateAuditLogInput, trx?: DomainTrx): Promise<void> {
    const query = trx
      ? AuditLogModel.query(trx as unknown as Knex.Transaction)
      : AuditLogModel.query();
    await query.insert({
      action: input.action,
      entity: input.entity,
      entityId: input.entityId,
      actorUserId: input.actorUserId ?? null,
      metadata: input.metadata ?? {},
    });
  }

  async findByEntity(entity: string, entityId: string): Promise<AuditLog[]> {
    const rows = await AuditLogModel.query()
      .where({ entity, entityId })
      .orderBy("createdAt", "desc");
    return rows.map(toEntity);
  }
}
