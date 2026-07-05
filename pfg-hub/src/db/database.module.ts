import { Global, Inject, Injectable, Module } from "@nestjs/common";
import type { OnApplicationShutdown } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadConfig } from "../config";
import * as schema from "./schema";

export const DATABASE = Symbol("DATABASE");
export const PG_POOL = Symbol("PG_POOL");

export type Database = ReturnType<typeof drizzle<typeof schema>>;

@Injectable()
class PgPoolLifecycle implements OnApplicationShutdown {
  constructor(@Inject(PG_POOL) private readonly pool: Pool) {}

  /** Closes the shared PostgreSQL connection pool during Nest shutdown. */
  async onApplicationShutdown(): Promise<void> {
    await this.pool.end();
  }
}

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      // Creates the PostgreSQL pool used by all database providers.
      useFactory: () =>
        new Pool({ connectionString: loadConfig().databaseUrl }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      // Wraps the PostgreSQL pool in a typed Drizzle client.
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
    PgPoolLifecycle,
  ],
  exports: [DATABASE, PG_POOL],
})
export class DatabaseModule {}
