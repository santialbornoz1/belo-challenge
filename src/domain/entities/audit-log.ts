export interface AuditLog {
  id: string;
  action: string;
  entity: string;
  entityId: string;
  actorUserId: string | null;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface CreateAuditLogInput {
  action: string;
  entity: string;
  entityId: string;
  actorUserId?: string | null;
  metadata?: Record<string, unknown>;
}
