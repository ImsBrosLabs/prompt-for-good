import {
  BadRequestException,
  Inject,
  Injectable,
  InternalServerErrorException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import {
  indexRuntimeConfigCatalog,
  parseRuntimeConfigValue,
  resolveRuntimeConfigValue,
  RuntimeConfigValueSource,
  toRuntimeConfigAdminItem,
} from "@pfg/runtime-config-core/runtimeConfig";
import { eq } from "drizzle-orm";
import { DATABASE, Database } from "../db/database.module";
import {
  RuntimeConfigJsonValue,
  RuntimeConfigOverride,
  runtimeConfigOverrides,
} from "../db/schema";
import { RuntimeConfigItemDto } from "../openapi/dtos";
import {
  RUNTIME_CONFIG_CATALOG,
  RuntimeConfigCatalogEntry,
  RuntimeConfigKey,
  RuntimeConfigValue,
} from "./runtime-config.catalog";

const RUNNER_SNAPSHOT_EXCLUDED_KEYS = new Set<RuntimeConfigKey>([
  "PFG_AGENT_ADMIN_TOKEN",
]);
const runtimeConfigCatalogByKey = indexRuntimeConfigCatalog(RUNTIME_CONFIG_CATALOG);

export type RuntimeConfigChange = {
  key: RuntimeConfigKey;
  operation: "set" | "reset";
};

type RuntimeConfigChangeListener = (
  change: RuntimeConfigChange,
) => void | Promise<void>;

@Injectable()
export class RuntimeConfigService {
  private readonly listeners = new Set<RuntimeConfigChangeListener>();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ConfigService) private readonly configService: ConfigService,
  ) {}

  /** Resolves a known key through database override, startup env and catalog default. */
  async get<Key extends RuntimeConfigKey>(
    key: Key,
  ): Promise<RuntimeConfigValue<Key>> {
    const entry = this.requireEntry(key);
    const override = await this.findOverride(entry.key);
    return this.resolveValue(entry, override).value as RuntimeConfigValue<Key>;
  }

  /** Returns admin-safe runtime settings with source and catalog metadata. */
  async list(): Promise<RuntimeConfigItemDto[]> {
    const overrides = await this.db.select().from(runtimeConfigOverrides);
    const overridesByKey = new Map(overrides.map((row) => [row.key, row]));

    return RUNTIME_CONFIG_CATALOG.map((entry) =>
      this.toAdminItem(entry, overridesByKey.get(entry.key) ?? null),
    );
  }

  /** Builds the runner-facing snapshot with effective values, including runner secrets. */
  async runnerSnapshot(): Promise<Record<string, RuntimeConfigJsonValue>> {
    const overrides = await this.db.select().from(runtimeConfigOverrides);
    const overridesByKey = new Map(overrides.map((row) => [row.key, row]));
    const values: Record<string, RuntimeConfigJsonValue> = {};

    for (const entry of RUNTIME_CONFIG_CATALOG) {
      if (RUNNER_SNAPSHOT_EXCLUDED_KEYS.has(entry.key)) continue;
      values[entry.env] = this.resolveValue(
        entry,
        overridesByKey.get(entry.key) ?? null,
      ).value;
    }

    return values;
  }

  /** Validates and stores an explicit local database override. */
  async set<Key extends RuntimeConfigKey>(
    key: Key,
    value: unknown,
    updatedBy: string,
  ): Promise<RuntimeConfigItemDto> {
    const entry = this.requireEntry(key);
    const parsed = this.parse(entry, value, "database");
    const now = new Date().toISOString();
    const normalizedUpdatedBy = updatedBy.trim() || "admin";

    await this.db
      .insert(runtimeConfigOverrides)
      .values({
        key: entry.key,
        value: parsed,
        updatedAt: now,
        updatedBy: normalizedUpdatedBy,
      })
      .onConflictDoUpdate({
        target: runtimeConfigOverrides.key,
        set: {
          value: parsed,
          updatedAt: now,
          updatedBy: normalizedUpdatedBy,
        },
      });

    await this.notifyChange({ key: entry.key, operation: "set" });

    return this.toAdminItem(entry, {
      key: entry.key,
      value: parsed,
      updatedAt: now,
      updatedBy: normalizedUpdatedBy,
    });
  }

  /** Deletes an override so the effective value falls back to env/default. */
  async reset<Key extends RuntimeConfigKey>(
    key: Key,
  ): Promise<RuntimeConfigItemDto> {
    const entry = this.requireEntry(key);
    await this.db
      .delete(runtimeConfigOverrides)
      .where(eq(runtimeConfigOverrides.key, entry.key));
    await this.notifyChange({ key: entry.key, operation: "reset" });
    return this.toAdminItem(entry, null);
  }

  /** Registers listeners for future local services that need config change signals. */
  onChange(listener: RuntimeConfigChangeListener): () => void {
    this.listeners.add(listener);
    return () => {
      this.listeners.delete(listener);
    };
  }

  /** Ensures every public read or write targets a catalog-owned env key. */
  private requireEntry<Key extends RuntimeConfigKey>(
    key: Key,
  ): RuntimeConfigEntryFor<Key> {
    const entry = runtimeConfigCatalogByKey.get(key);
    if (!entry) {
      throw new BadRequestException(
        `Unknown runtime configuration key: ${key}`,
      );
    }
    return entry as RuntimeConfigEntryFor<Key>;
  }

  /** Loads the sparse persisted override for one catalog key. */
  private async findOverride(
    key: RuntimeConfigKey,
  ): Promise<RuntimeConfigOverride | null> {
    const [override] = await this.db
      .select()
      .from(runtimeConfigOverrides)
      .where(eq(runtimeConfigOverrides.key, key))
      .limit(1);
    return override ?? null;
  }

  /** Shapes one admin response while hiding secret values and defaults. */
  private toAdminItem(
    entry: RuntimeConfigCatalogEntry,
    override: RuntimeConfigOverride | null,
  ): RuntimeConfigItemDto {
    return toRuntimeConfigAdminItem({
      entry,
      override,
      readEnv: (env) => this.configService.get<string>(env),
      invalidDatabaseValue: (key) =>
        new BadRequestException(
          `Invalid value for runtime configuration key: ${key}`,
        ),
      invalidConfiguredValue: (key, source) =>
        new InternalServerErrorException(
          `Invalid ${source} value for runtime configuration key: ${key}`,
        ),
      formatUpdatedAt: (value) => String(value),
      metadata: { requiredForSetup: entry.requiredForSetup },
    }) as unknown as RuntimeConfigItemDto;
  }

  /** Runs listeners after persistence so dependent local services can react. */
  private async notifyChange(change: RuntimeConfigChange): Promise<void> {
    await Promise.all([...this.listeners].map((listener) => listener(change)));
  }

  /** Applies database, env and default precedence with validation at every source. */
  private resolveValue(
    entry: RuntimeConfigCatalogEntry,
    override: RuntimeConfigOverride | null,
  ): {
    value: RuntimeConfigJsonValue;
    source: RuntimeConfigValueSource;
  } {
    return resolveRuntimeConfigValue({
      entry,
      override,
      readEnv: (env) => this.configService.get<string>(env),
      invalidDatabaseValue: (key) =>
        new BadRequestException(
          `Invalid value for runtime configuration key: ${key}`,
        ),
      invalidConfiguredValue: (key, source) =>
        new InternalServerErrorException(
          `Invalid ${source} value for runtime configuration key: ${key}`,
        ),
    }) as {
      value: RuntimeConfigJsonValue;
      source: RuntimeConfigValueSource;
    };
  }

  /** Normalizes and validates raw database, environment and default values. */
  private parse(
    entry: RuntimeConfigCatalogEntry,
    value: unknown,
    source: RuntimeConfigValueSource,
  ): RuntimeConfigJsonValue {
    return parseRuntimeConfigValue(entry, value, source, {
      invalidDatabaseValue: (key) =>
        new BadRequestException(
          `Invalid value for runtime configuration key: ${key}`,
        ),
      invalidConfiguredValue: (key, invalidSource) =>
        new InternalServerErrorException(
          `Invalid ${invalidSource} value for runtime configuration key: ${key}`,
        ),
    }) as RuntimeConfigJsonValue;
  }
}

type RuntimeConfigEntryFor<Key extends RuntimeConfigKey> = Extract<
  RuntimeConfigCatalogEntry,
  { key: Key }
>;
