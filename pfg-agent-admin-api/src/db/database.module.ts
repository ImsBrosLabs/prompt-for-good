import { Global, Inject, Module } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import DatabaseDriver from "better-sqlite3";
import { drizzle } from "drizzle-orm/better-sqlite3";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";
import { APP_CONFIG, AppConfig } from "../config";
import * as schema from "./schema";

export const DATABASE = Symbol("DATABASE");
export const SQLITE_CONNECTION = Symbol("SQLITE_CONNECTION");

export type SqliteConnection = DatabaseDriver.Database;
export type Database = ReturnType<typeof drizzle<typeof schema>>;

class SqliteLifecycle implements OnApplicationShutdown {
  constructor(
    @Inject(SQLITE_CONNECTION) private readonly connection: SqliteConnection,
  ) {}

  /** Closes the local SQLite connection when the Nest application shuts down. */
  onApplicationShutdown(): void {
    this.connection.close();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: SQLITE_CONNECTION,
      inject: [APP_CONFIG],
      // Ensures the configured local data directory exists before opening SQLite.
      useFactory: (config: AppConfig) => {
        mkdirSync(dirname(config.configDatabasePath), { recursive: true });
        return new DatabaseDriver(config.configDatabasePath);
      },
    },
    {
      provide: DATABASE,
      inject: [SQLITE_CONNECTION],
      // Wraps the SQLite connection in a typed Drizzle client.
      useFactory: (connection: SqliteConnection) =>
        drizzle(connection, { schema }),
    },
    SqliteLifecycle,
  ],
  exports: [DATABASE, SQLITE_CONNECTION],
})
export class DatabaseModule {}
