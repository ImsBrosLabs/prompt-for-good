import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadConfig } from "../src/config";

/** Applies every idempotent SQL migration to the configured PostgreSQL database. */
async function main() {
  const pool = new pg.Pool({ connectionString: loadConfig().databaseUrl });
  const migrationDir = join(process.cwd(), "src/main/resources/db/migration");
  const migrations = readdirSync(migrationDir)
    .filter((file) => file.endsWith(".sql"))
    .sort();

  try {
    for (const migration of migrations) {
      const sql = readFileSync(join(migrationDir, migration), "utf8");
      await pool.query(sql);
    }
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
