import type { Knex } from "knex";
import { v4 as uuid } from "uuid";

export async function seed(knex: Knex): Promise<void> {
  await knex("audit_logs").del();
  await knex("transactions").del();
  await knex("users").del();

  await knex("users").insert([
    {
      id: uuid(),
      name: "Alice Admin",
      email: "alice@demo.com",
      balance: "100000.00",
      role: "admin",
    },
    {
      id: uuid(),
      name: "Bob Demo",
      email: "bob@demo.com",
      balance: "50000.00",
      role: "user",
    },
    {
      id: uuid(),
      name: "Carol Demo",
      email: "carol@demo.com",
      balance: "0.00",
      role: "user",
    },
  ]);
}
