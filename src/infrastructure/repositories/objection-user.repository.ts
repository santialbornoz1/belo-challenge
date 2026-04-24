import type { Knex } from "knex";
import type { UserRepository } from "../../domain/ports/user.repository";
import type { User, CreateUserInput } from "../../domain/entities/user";
import type { DomainTrx } from "../../domain/ports/audit.repository";
import { UserModel } from "../models/user.model";
import { DuplicateEmailError } from "../../domain/errors";
import { isPgUniqueViolation } from "./pg-errors";

function toEntity(m: UserModel): User {
  return {
    id: m.id,
    name: m.name,
    email: m.email,
    balance: String(m.balance),
    role: m.role,
    createdAt: new Date(m.createdAt),
    updatedAt: new Date(m.updatedAt),
  };
}

export class ObjectionUserRepository implements UserRepository {
  async create(input: CreateUserInput): Promise<User> {
    try {
      const m = await UserModel.query().insertAndFetch({
        name: input.name,
        email: input.email,
        balance: input.initialBalance ?? "0",
      });
      return toEntity(m);
    } catch (err) {
      if (isPgUniqueViolation(err, "email")) {
        throw new DuplicateEmailError(input.email);
      }
      throw err;
    }
  }

  async findById(id: string): Promise<User | null> {
    const m = await UserModel.query().findById(id);
    return m ? toEntity(m) : null;
  }

  async findByEmail(email: string): Promise<User | null> {
    const m = await UserModel.query().findOne({ email });
    return m ? toEntity(m) : null;
  }

  async list(limit: number, offset: number): Promise<User[]> {
    const rows = await UserModel.query()
      .orderBy("createdAt", "desc")
      .limit(limit)
      .offset(offset);
    return rows.map(toEntity);
  }

  async findByIdsForUpdate(ids: string[], trx: DomainTrx): Promise<Map<string, User>> {
    const unique = [...new Set(ids)];
    const rows = await UserModel.query(trx as unknown as Knex.Transaction)
      .whereIn("id", unique)
      .forUpdate();
    const map = new Map<string, User>();
    for (const r of rows) map.set(r.id, toEntity(r));
    return map;
  }

  async updateBalance(id: string, newBalance: string, trx: DomainTrx): Promise<void> {
    await UserModel.query(trx as unknown as Knex.Transaction)
      .findById(id)
      .patch({ balance: newBalance });
  }
}
