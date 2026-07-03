import { readFileSync } from "node:fs";
import { join } from "node:path";
import pg from "pg";
import { loadConfig } from "../src/config";

async function main() {
  const pool = new pg.Pool({ connectionString: loadConfig().databaseUrl });
  const sql = readFileSync(join(process.cwd(), "src/main/resources/db/migration/V1__Initial_Schema.sql"), "utf8");

  try {
    await pool.query(sql);
  } finally {
    await pool.end();
  }
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
