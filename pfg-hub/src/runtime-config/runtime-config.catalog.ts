import { validateCronExpression } from "cron";
import { z } from "zod";

export type RuntimeConfigCategory =
  "Issues" | "GitHub ingestion" | "GitHub API";

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
