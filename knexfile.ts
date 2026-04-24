import type { Knex } from "knex";

const base: Knex.Config = {
  client: "pg",
  migrations: { directory: "./migrations", extension: "ts" },
  seeds: { directory: "./seeds", extension: "ts" },
  pool: { min: 2, max: 10 },
};

const config: Record<string, Knex.Config> = {
  development: {
    ...base,
    connection:
      process.env.DATABASE_URL ||
      "postgresql://belo:belo123@localhost:5432/belo_challenge",
  },
  test: {
    ...base,
    connection:
      process.env.DATABASE_URL ||
      "postgresql://belo:belo123@localhost:5432/belo_challenge_test",
  },
};

export default config;
