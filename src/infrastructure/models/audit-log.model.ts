import { BaseModel } from "./base.model";

export class AuditLogModel extends BaseModel {
  static tableName = "audit_logs";

  id!: string;
  action!: string;
  entity!: string;
  entityId!: string;
  actorUserId!: string | null;
  metadata!: Record<string, unknown>;
  createdAt!: string;
}
