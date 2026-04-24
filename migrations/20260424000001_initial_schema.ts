import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw('CREATE EXTENSION IF NOT EXISTS "uuid-ossp"');

  await knex.schema.createTable("users", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("name").notNullable();
    t.string("email").notNullable().unique();
    t.decimal("balance", 20, 2).notNullable().defaultTo(0);
    t.timestamps(true, true);
    t.check("?? >= 0", ["balance"], "users_balance_non_negative");
  });

  await knex.schema.createTable("transactions", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("idempotency_key").notNullable();
    t.uuid("from_user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");
    t.uuid("to_user_id")
      .notNullable()
      .references("id")
      .inTable("users")
      .onDelete("RESTRICT");
    t.decimal("amount", 20, 2).notNullable();
    t.enum("status", ["pending", "confirmed", "rejected"], {
      useNative: true,
      enumName: "transaction_status",
    })
      .notNullable()
      .defaultTo("pending");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.timestamp("confirmed_at", { useTz: true }).nullable();
    t.timestamp("rejected_at", { useTz: true }).nullable();
    t.check("?? > 0", ["amount"], "transactions_amount_positive");
    t.check("?? <> ??", ["from_user_id", "to_user_id"], "transactions_distinct_users");
    t.unique(["idempotency_key"]);
    t.index(["from_user_id", "created_at"]);
    t.index(["to_user_id", "created_at"]);
    t.index(["status"]);
  });

  await knex.schema.createTable("audit_logs", (t) => {
    t.uuid("id").primary().defaultTo(knex.raw("uuid_generate_v4()"));
    t.string("action").notNullable();
    t.string("entity").notNullable();
    t.uuid("entity_id").notNullable();
    t.uuid("actor_user_id").nullable();
    t.jsonb("metadata").notNullable().defaultTo("{}");
    t.timestamp("created_at", { useTz: true }).notNullable().defaultTo(knex.fn.now());
    t.index(["entity", "entity_id"]);
    t.index(["actor_user_id", "created_at"]);
    t.index(["action", "created_at"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.dropTableIfExists("audit_logs");
  await knex.schema.dropTableIfExists("transactions");
  await knex.raw('DROP TYPE IF EXISTS transaction_status');
  await knex.schema.dropTableIfExists("users");
}
