import { validateCronExpression } from "cron";
import { z } from "zod";

export type RuntimeConfigCategory =
  "Hub" | "Security" | "Issues" | "GitHub ingestion" | "GitHub API";

export type RuntimeConfigValueSource = "database" | "environment" | "default";

export type RuntimeConfigValueType = "boolean" | "integer" | "string";

type RuntimeConfigDefinition<Key extends string, Schema extends z.ZodType> = {
  key: Key;
  env: string;
  defaultValue: z.output<Schema>;
  schema: Schema;
  label: string;
  description: string;
  category: RuntimeConfigCategory;
  secret: boolean;
  valueType: RuntimeConfigValueType;
};

// Accepts boolean environment variables without loosening persisted JSON values.
const booleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (normalized === "true") return true;
  if (normalized === "false") return false;
  return value;
}, z.boolean());

// Normalizes numeric environment variables while preserving integer bounds.
const integerSchema = (minimum: number, maximum?: number) =>
  z.preprocess(
    (value) =>
      typeof value === "string" && value.trim() !== "" ? Number(value) : value,
    z
      .number()
      .int()
      .min(minimum)
      .pipe(
        maximum === undefined
          ? z.number().int()
          : z.number().int().max(maximum),
      ),
  );

// Trims scheduler-like string settings so blank overrides are rejected.
const nonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1),
);

// Rejects invalid cron overrides before they can be persisted or scheduled.
const cronSchema = nonEmptyStringSchema.refine(
  (value) => validateCronExpression(value).valid,
  "Invalid cron expression",
);

function defineCatalog<
  const Entries extends readonly RuntimeConfigDefinition<string, z.ZodType>[],
>(entries: Entries): Entries {
  return entries;
}

export const RUNTIME_CONFIG_CATALOG = defineCatalog([
  {
    key: "port",
    env: "PORT",
    defaultValue: 8080,
    schema: integerSchema(1, 65_535),
    label: "HTTP port",
    description: "Port used by the hub process when it starts.",
    category: "Hub",
    secret: false,
    valueType: "integer",
  },
  {
    key: "httpsEnabled",
    env: "HTTPS_ENABLED",
    defaultValue: false,
    schema: booleanSchema,
    label: "HTTPS",
    description: "Enables HTTPS for the hub process when certificates exist.",
    category: "Hub",
    secret: false,
    valueType: "boolean",
  },
  {
    key: "httpsCertPath",
    env: "HTTPS_CERT_PATH",
    defaultValue: "./certs/hub.pfg.local.pem",
    schema: nonEmptyStringSchema,
    label: "HTTPS certificate path",
    description: "Filesystem path to the local HTTPS certificate.",
    category: "Hub",
    secret: false,
    valueType: "string",
  },
  {
    key: "httpsKeyPath",
    env: "HTTPS_KEY_PATH",
    defaultValue: "./certs/hub.pfg.local-key.pem",
    schema: nonEmptyStringSchema,
    label: "HTTPS private key path",
    description: "Filesystem path to the local HTTPS private key.",
    category: "Hub",
    secret: true,
    valueType: "string",
  },
  {
    key: "databaseUrl",
    env: "DATABASE_URL",
    defaultValue: "postgresql://pfg:pfg@localhost:5432/pfg",
    schema: nonEmptyStringSchema,
    label: "Database URL",
    description:
      "PostgreSQL connection string used by the hub database provider.",
    category: "Hub",
    secret: true,
    valueType: "string",
  },
  {
    key: "corsOrigins",
    env: "CORS_ORIGINS",
    defaultValue: "http://localhost:5173,http://127.0.0.1:5173",
    schema: nonEmptyStringSchema,
    label: "CORS origins",
    description: "Comma-separated browser origins allowed by the hub.",
    category: "Hub",
    secret: false,
    valueType: "string",
  },
  {
    key: "adminKey",
    env: "ADMIN_KEY",
    defaultValue: "",
    schema: z.string(),
    label: "Admin key",
    description: "Static token required by admin and seed endpoints.",
    category: "Security",
    secret: true,
    valueType: "string",
  },
  {
    key: "issueMaxRetries",
    env: "ISSUE_MAX_RETRIES",
    defaultValue: 3,
    schema: integerSchema(0, 20),
    label: "Maximum issue retries",
    description:
      "Allowed failure count before marking an issue as permanently failed.",
    category: "Issues",
    secret: false,
    valueType: "integer",
  },
  {
    key: "issueClaimTimeoutMs",
    env: "ISSUE_CLAIM_TIMEOUT_MS",
    defaultValue: 2 * 60 * 60 * 1000,
    schema: integerSchema(5 * 60 * 1000),
    label: "Issue claim timeout",
    description:
      "Maximum time a runner may keep an issue claimed before the hub treats it as timed out.",
    category: "Issues",
    secret: false,
    valueType: "integer",
  },
  {
    key: "runnerHeartbeatTimeoutMs",
    env: "RUNNER_HEARTBEAT_TIMEOUT_MS",
    defaultValue: 30 * 60 * 1000,
    schema: integerSchema(60_000),
    label: "Runner heartbeat timeout",
    description:
      "Maximum heartbeat age before an active runner is marked inactive.",
    category: "Issues",
    secret: false,
    valueType: "integer",
  },
  {
    key: "queueMaintenanceBatchSize",
    env: "QUEUE_MAINTENANCE_BATCH_SIZE",
    defaultValue: 100,
    schema: integerSchema(1, 1000),
    label: "Queue maintenance batch size",
    description:
      "Maximum number of stale claimed issues reclaimed during one dispatch poll.",
    category: "Issues",
    secret: false,
    valueType: "integer",
  },
  {
    key: "issueMinScore",
    env: "ISSUE_MIN_SCORE",
    defaultValue: 60,
    schema: integerSchema(60, 100),
    label: "Minimum issue score",
    description:
      "Minimum score required to add a discovered GitHub issue to the work queue.",
    category: "Issues",
    secret: false,
    valueType: "integer",
  },
  {
    key: "githubIngestionEnabled",
    env: "GITHUB_INGESTION_ENABLED",
    defaultValue: false,
    schema: booleanSchema,
    label: "Scheduled GitHub ingestion",
    description:
      "Enables the internal cron job that automatically discovers and recrawls GitHub repositories.",
    category: "GitHub ingestion",
    secret: false,
    valueType: "boolean",
  },
  {
    key: "githubIngestionCron",
    env: "GITHUB_INGESTION_CRON",
    defaultValue: "0 */6 * * *",
    schema: cronSchema,
    label: "Ingestion cron expression",
    description:
      "Cron schedule used at hub startup when GitHub ingestion is enabled.",
    category: "GitHub ingestion",
    secret: false,
    valueType: "string",
  },
  {
    key: "githubRecrawlAfterMs",
    env: "GITHUB_RECRAWL_AFTER_MS",
    defaultValue: 6 * 60 * 60 * 1000,
    schema: integerSchema(60_000),
    label: "Recrawl delay",
    description:
      "Minimum duration in milliseconds before recrawling an eligible known repository.",
    category: "GitHub ingestion",
    secret: false,
    valueType: "integer",
  },
  {
    key: "githubDiscoveryMaxPagesPerLabel",
    env: "GITHUB_DISCOVERY_MAX_PAGES_PER_LABEL",
    defaultValue: 2,
    schema: integerSchema(1, 20),
    label: "GitHub pages per label",
    description:
      "Maximum number of GitHub search pages inspected for each discovery label.",
    category: "GitHub ingestion",
    secret: false,
    valueType: "integer",
  },
  {
    key: "githubDiscoveryMaxRepositories",
    env: "GITHUB_DISCOVERY_MAX_REPOSITORIES",
    defaultValue: 50,
    schema: integerSchema(1, 500),
    label: "Maximum discovered repositories",
    description:
      "Maximum number of unique repositories processed during one GitHub discovery pass.",
    category: "GitHub ingestion",
    secret: false,
    valueType: "integer",
  },
  {
    key: "githubToken",
    env: "GITHUB_TOKEN",
    defaultValue: "dummy",
    schema: nonEmptyStringSchema,
    label: "GitHub token",
    description: "Token used for authenticated GitHub API calls.",
    category: "GitHub API",
    secret: true,
    valueType: "string",
  },
  {
    key: "githubMaxRetries",
    env: "GITHUB_MAX_RETRIES",
    defaultValue: 3,
    schema: integerSchema(0, 10),
    label: "GitHub retries",
    description:
      "Retry count for recoverable GitHub API network or HTTP errors.",
    category: "GitHub API",
    secret: false,
    valueType: "integer",
  },
  {
    key: "githubBackoffBaseMs",
    env: "GITHUB_BACKOFF_BASE_MS",
    defaultValue: 1000,
    schema: integerSchema(1, 60_000),
    label: "GitHub backoff base",
    description:
      "Base duration in milliseconds for exponential backoff between GitHub retries.",
    category: "GitHub API",
    secret: false,
    valueType: "integer",
  },
  {
    key: "githubMinRateLimitRemaining",
    env: "GITHUB_MIN_RATE_LIMIT_REMAINING",
    defaultValue: 5,
    schema: integerSchema(0, 1000),
    label: "Minimum GitHub quota",
    description:
      "Remaining quota threshold below which non-essential GitHub calls are interrupted.",
    category: "GitHub API",
    secret: false,
    valueType: "integer",
  },
] as const);

export type RuntimeConfigCatalogEntry = (typeof RUNTIME_CONFIG_CATALOG)[number];
export type RuntimeConfigKey = RuntimeConfigCatalogEntry["key"];
export type RuntimeConfigEntryForKey<Key extends RuntimeConfigKey> = Extract<
  RuntimeConfigCatalogEntry,
  { key: Key }
>;
export type RuntimeConfigValue<Key extends RuntimeConfigKey> = z.output<
  RuntimeConfigEntryForKey<Key>["schema"]
>;

export const runtimeConfigKeys = RUNTIME_CONFIG_CATALOG.map(
  (entry) => entry.key,
);

export const runtimeConfigCatalogByKey = new Map(
  RUNTIME_CONFIG_CATALOG.map((entry) => [entry.key, entry]),
);
