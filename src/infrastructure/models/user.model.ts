import { BaseModel } from "./base.model";

export class UserModel extends BaseModel {
  static tableName = "users";

  id!: string;
  name!: string;
  email!: string;
  balance!: string;
  role!: "user" | "admin";
  createdAt!: string;
  updatedAt!: string;

  static get jsonSchema() {
    return {
      type: "object",
      required: ["name", "email"],
      properties: {
        id: { type: "string", format: "uuid" },
        name: { type: "string", minLength: 1, maxLength: 255 },
        email: { type: "string", format: "email", maxLength: 255 },
        balance: { type: "string" },
        role: { type: "string", enum: ["user", "admin"] },
      },
    };
  }
}
