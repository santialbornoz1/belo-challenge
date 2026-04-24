import knex from "knex";
import config from "../knexfile";

async function main() {
  const email = process.argv[2];
  if (!email) {
    console.error("Uso: tsx scripts/promote-admin.ts <email>");
    process.exit(1);
  }

  const env = process.env.NODE_ENV === "test" ? "test" : "development";
  const db = knex(config[env]!);

  try {
    const updated = await db("users")
      .where({ email })
      .update({ role: "admin" })
      .returning(["id", "name", "email", "role"]);

    if (updated.length === 0) {
      console.error(`No existe un usuario con email ${email}`);
      process.exit(1);
    }

    const user = updated[0];
    console.log(`Promovido a admin: ${user.name} <${user.email}> (${user.id})`);
  } finally {
    await db.destroy();
  }
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
