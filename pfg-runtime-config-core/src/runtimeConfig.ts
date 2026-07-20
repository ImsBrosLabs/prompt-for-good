export type RuntimeConfigValueSource = "database" | "environment" | "default";

export type RuntimeConfigJsonValue =
  | string
  | number
  | boolean
  | null
  | readonly RuntimeConfigJsonValue[]
  | { readonly [key: string]: RuntimeConfigJsonValue };

type ParseResult<Output> =
  | { success: true; data: Output }
  | { success: false; error: unknown };

type RuntimeConfigSchema<Output> = {
  safeParse: (value: unknown) => ParseResult<Output>;
};

export type RuntimeConfigCatalogEntryBase = {
  key: string;
  env: string;
  defaultValue: unknown;
  schema: RuntimeConfigSchema<unknown>;
  label: string;
  description: string;
  category: string;
  secret: boolean;
  valueType: string;
};

export type RuntimeConfigOverrideBase = {
  key: string;
  value: unknown;
  updatedAt: unknown;
  updatedBy: string | null;
};

export type RuntimeConfigResolvedValue = {
  value: RuntimeConfigJsonValue;
  source: RuntimeConfigValueSource;
};

export type RuntimeConfigAdminItem = {
  id: string;
  key: string;
  value: RuntimeConfigJsonValue | null;
  environmentValue: string | null;
  source: RuntimeConfigValueSource;
  hasDatabaseOverride: boolean;
  updatedAt: string | null;
  updatedBy: string | null;
  metadata: Record<string, unknown>;
};

type RuntimeConfigResolverOptions<Entry extends RuntimeConfigCatalogEntryBase> = {
  entry: Entry;
  override: RuntimeConfigOverrideBase | null;
  readEnv: (env: string) => string | undefined;
  invalidDatabaseValue: (key: Entry["key"]) => Error;
  invalidConfiguredValue: (
    key: Entry["key"],
    source: Exclude<RuntimeConfigValueSource, "database">,
  ) => Error;
};

type RuntimeConfigAdminItemOptions<Entry extends RuntimeConfigCatalogEntryBase> =
  RuntimeConfigResolverOptions<Entry> & {
    formatUpdatedAt: (value: unknown) => string;
    metadata?: Record<string, unknown>;
  };

/** Builds a key index for catalog-owned runtime configuration entries. */
export function indexRuntimeConfigCatalog<
  Entry extends RuntimeConfigCatalogEntryBase,
>(catalog: readonly Entry[]): Map<Entry["key"], Entry> {
  return new Map(catalog.map((entry) => [entry.key, entry]));
}

/** Validates one raw value using the catalog entry schema and source-specific errors. */
export function parseRuntimeConfigValue<
  Entry extends RuntimeConfigCatalogEntryBase,
>(
  entry: Entry,
  value: unknown,
  source: RuntimeConfigValueSource,
  errors: Pick<
    RuntimeConfigResolverOptions<Entry>,
    "invalidDatabaseValue" | "invalidConfiguredValue"
  >,
): RuntimeConfigJsonValue {
  const result = entry.schema.safeParse(value);
  if (result.success) return result.data as RuntimeConfigJsonValue;

  if (source === "database") {
    throw errors.invalidDatabaseValue(entry.key);
  }

  throw errors.invalidConfiguredValue(entry.key, source);
}

/** Applies the database, environment, default precedence rule for one catalog entry. */
export function resolveRuntimeConfigValue<
  Entry extends RuntimeConfigCatalogEntryBase,
>(options: RuntimeConfigResolverOptions<Entry>): RuntimeConfigResolvedValue {
  if (options.override) {
    return {
      value: parseRuntimeConfigValue(
        options.entry,
        options.override.value,
        "database",
        options,
      ),
      source: "database",
    };
  }

  const envValue = options.readEnv(options.entry.env);
  if (envValue !== undefined) {
    return {
      value: parseRuntimeConfigValue(
        options.entry,
        envValue,
        "environment",
        options,
      ),
      source: "environment",
    };
  }

  return {
    value: parseRuntimeConfigValue(
      options.entry,
      options.entry.defaultValue,
      "default",
      options,
    ),
    source: "default",
  };
}

/** Shapes one admin-safe item while keeping effective secret values hidden. */
export function toRuntimeConfigAdminItem<
  Entry extends RuntimeConfigCatalogEntryBase,
>(options: RuntimeConfigAdminItemOptions<Entry>): RuntimeConfigAdminItem {
  const resolved = resolveRuntimeConfigValue(options);
  const value = options.entry.secret ? null : resolved.value;
  const defaultValue = options.entry.secret ? null : options.entry.defaultValue;
  const environmentValue = options.entry.secret
    ? null
    : (options.readEnv(options.entry.env) ?? null);

  return {
    id: options.entry.key,
    key: options.entry.key,
    value,
    environmentValue,
    source: resolved.source,
    hasDatabaseOverride: options.override !== null,
    updatedAt: options.override ? options.formatUpdatedAt(options.override.updatedAt) : null,
    updatedBy: options.override?.updatedBy ?? null,
    metadata: {
      env: options.entry.env,
      label: options.entry.label,
      description: options.entry.description,
      category: options.entry.category,
      secret: options.entry.secret,
      valueType: options.entry.valueType,
      defaultValue,
      ...options.metadata,
    },
  };
}
