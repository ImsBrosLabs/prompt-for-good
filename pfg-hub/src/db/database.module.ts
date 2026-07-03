import { Global, Module } from "@nestjs/common";
import { drizzle } from "drizzle-orm/node-postgres";
import { Pool } from "pg";
import { loadConfig } from "../config";
import * as schema from "./schema";

export const DATABASE = Symbol("DATABASE");
export const PG_POOL = Symbol("PG_POOL");

export type Database = ReturnType<typeof drizzle<typeof schema>>;

@Global()
@Module({
  providers: [
    {
      provide: PG_POOL,
      useFactory: () =>
        new Pool({ connectionString: loadConfig().databaseUrl }),
    },
    {
      provide: DATABASE,
      inject: [PG_POOL],
      useFactory: (pool: Pool) => drizzle(pool, { schema }),
    },
  ],
  exports: [DATABASE, PG_POOL],
})
export class DatabaseModule {}
