import DatabaseDriver from "better-sqlite3";
import { mkdirSync, readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { loadConfig } from "../src/config";

const migrationDirectory = join(
  process.cwd(),
  "src/main/resources/db/migration",
);

/** Applies idempotent SQL migrations to the configured local SQLite database. */
function migrate(): void {
  const config = loadConfig();
  mkdirSync(dirname(config.configDatabasePath), { recursive: true });

  const db = new DatabaseDriver(config.configDatabasePath);
  try {
    const migrationFiles = readdirSync(migrationDirectory)
      .filter((file) => file.endsWith(".sql"))
      .sort();

    for (const file of migrationFiles) {
      const sql = readFileSync(join(migrationDirectory, file), "utf8");
      db.exec(sql);
      console.log(`Applied ${file}`);
    }
  } finally {
    db.close();
  }
}

migrate();
