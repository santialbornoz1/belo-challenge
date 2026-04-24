import type { Knex } from "knex";

export async function up(knex: Knex): Promise<void> {
  await knex.raw(
    `CREATE TYPE user_role AS ENUM ('user', 'admin')`,
  );
  await knex.schema.alterTable("users", (t) => {
    t.specificType("role", "user_role").notNullable().defaultTo("user");
  });
  await knex.schema.alterTable("users", (t) => {
    t.index(["role"]);
  });
}

export async function down(knex: Knex): Promise<void> {
  await knex.schema.alterTable("users", (t) => {
    t.dropIndex(["role"]);
    t.dropColumn("role");
  });
  await knex.raw(`DROP TYPE IF EXISTS user_role`);
}
