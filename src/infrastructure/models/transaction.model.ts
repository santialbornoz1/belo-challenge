import { Model } from "objection";
import { BaseModel } from "./base.model";
import { UserModel } from "./user.model";

export class TransactionModel extends BaseModel {
  static tableName = "transactions";

  id!: string;
  idempotencyKey!: string;
  fromUserId!: string;
  toUserId!: string;
  amount!: string;
  status!: "pending" | "confirmed" | "rejected";
  createdAt!: string;
  confirmedAt!: string | null;
  rejectedAt!: string | null;

  fromUser?: UserModel;
  toUser?: UserModel;

  static get relationMappings() {
    return {
      fromUser: {
        relation: Model.BelongsToOneRelation,
        modelClass: UserModel,
        join: { from: "transactions.fromUserId", to: "users.id" },
      },
      toUser: {
        relation: Model.BelongsToOneRelation,
        modelClass: UserModel,
        join: { from: "transactions.toUserId", to: "users.id" },
      },
    };
  }
}
