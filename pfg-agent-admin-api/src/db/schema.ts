import { sqliteTable, text } from "drizzle-orm/sqlite-core";

export type RuntimeConfigJsonValue =
  | string
  | number
  | boolean
  | null
  | RuntimeConfigJsonValue[]
  | { [key: string]: RuntimeConfigJsonValue };

export const runtimeConfigOverrides = sqliteTable("runtime_config_override", {
  key: text("key").primaryKey(),
  value: text("value", { mode: "json" })
    .$type<RuntimeConfigJsonValue>()
    .notNull(),
  updatedAt: text("updated_at").notNull(),
  updatedBy: text("updated_by"),
});

export type RuntimeConfigOverride = typeof runtimeConfigOverrides.$inferSelect;
export type NewRuntimeConfigOverride =
  typeof runtimeConfigOverrides.$inferInsert;
