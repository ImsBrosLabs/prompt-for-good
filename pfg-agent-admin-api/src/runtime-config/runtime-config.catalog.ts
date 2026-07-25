import { z } from "zod";

export type RuntimeConfigCategory =
  | "Local admin"
  | "Hub connection"
  | "Contributor identity"
  | "Model provider"
  | "Budgets"
  | "Runner preferences"
  | "Verification"
  | "Repository execution";

export type RuntimeConfigValueSource = "database" | "environment" | "default";

export type RuntimeConfigValueType = "boolean" | "integer" | "string" | "json";

type RuntimeConfigDefinition<Key extends string, Schema extends z.ZodType> = {
  key: Key;
  env: Key;
  defaultValue: z.output<Schema>;
  schema: Schema;
  label: string;
  description: string;
  category: RuntimeConfigCategory;
  secret: boolean;
  valueType: RuntimeConfigValueType;
  requiredForSetup: boolean;
};

const providerSchema = z.enum(["anthropic", "openai"]);
const networkPolicySchema = z.enum(["default", "disabled", "restricted"]);
const difficultySchema = z.enum(["easy", "medium", "hard"]);

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

// Trims string settings so blank overrides are rejected for required values.
const nonEmptyStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string().min(1),
);

const optionalStringSchema = z.preprocess(
  (value) => (typeof value === "string" ? value.trim() : value),
  z.string(),
);

// Accepts boolean env values from shell/.env while keeping stored overrides typed.
const booleanSchema = z.preprocess((value) => {
  if (typeof value !== "string") return value;
  const normalized = value.trim().toLowerCase();
  if (["true", "1", "yes", "on"].includes(normalized)) return true;
  if (["false", "0", "no", "off"].includes(normalized)) return false;
  return value;
}, z.boolean());

// Parses JSON-encoded environment values before applying the structured schema.
const jsonEnvironmentSchema = <Schema extends z.ZodType>(schema: Schema) =>
  z.preprocess((value) => {
    if (typeof value !== "string") return value;
    const trimmed = value.trim();
    if (!trimmed) return value;
    try {
      return JSON.parse(trimmed) as unknown;
    } catch {
      return value;
    }
  }, schema);

const stringListSchema = z.array(z.string().trim().min(1)).default([]);

const runnerProjectPreferencesSchema = jsonEnvironmentSchema(
  z
    .object({
      languages: stringListSchema,
      ecosystems: stringListSchema,
      licenses: stringListSchema,
      labels: stringListSchema,
      allowRepos: stringListSchema,
      blockRepos: stringListSchema,
      maxDifficulty: difficultySchema.nullish(),
      maxEstimatedMinutes: z.number().int().min(0).nullish(),
    })
    .strict()
    .default({
      languages: [],
      ecosystems: [],
      licenses: [],
      labels: [],
      allowRepos: [],
      blockRepos: [],
    }),
);

const commandListSchema = jsonEnvironmentSchema(
  z.array(z.string().trim().min(1)).default([]),
);

const repositoryExecutionLimitsSchema = jsonEnvironmentSchema(
  z
    .object({
      commandTimeoutSeconds: z.number().int().min(1).default(600),
      networkPolicy: networkPolicySchema.default("default"),
      maxProcesses: z.number().int().min(1).max(512).default(32),
      cleanupProcesses: z.boolean().default(true),
      maxDiskMb: z.number().int().min(128).default(4096),
    })
    .strict()
    .default({
      commandTimeoutSeconds: 600,
      networkPolicy: "default",
      maxProcesses: 32,
      cleanupProcesses: true,
      maxDiskMb: 4096,
    }),
);

function defineCatalog<
  const Entries extends readonly RuntimeConfigDefinition<string, z.ZodType>[],
>(entries: Entries): Entries {
  return entries;
}

export const RUNTIME_CONFIG_CATALOG = defineCatalog([
  {
    key: "PFG_AGENT_ADMIN_TOKEN",
    env: "PFG_AGENT_ADMIN_TOKEN",
    defaultValue: "",
    schema: optionalStringSchema,
    label: "Local admin token",
    description: "Static token required to access the local agent admin API.",
    category: "Local admin",
    secret: true,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "PFG_HUB_URL",
    env: "PFG_HUB_URL",
    defaultValue: "https://hub.promptforgood.dev",
    schema: nonEmptyStringSchema,
    label: "Hub URL",
    description: "Prompt for Good hub URL used by the runner.",
    category: "Hub connection",
    secret: false,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "PFG_HUB_TLS_VERIFY",
    env: "PFG_HUB_TLS_VERIFY",
    defaultValue: true,
    schema: booleanSchema,
    label: "Verify hub TLS",
    description: "Verifies the hub HTTPS certificate before runner requests.",
    category: "Hub connection",
    secret: false,
    valueType: "boolean",
    requiredForSetup: false,
  },
  {
    key: "PFG_TOKEN",
    env: "PFG_TOKEN",
    defaultValue: "",
    schema: optionalStringSchema,
    label: "Hub runner token",
    description: "Runner token used to authenticate with the hub.",
    category: "Hub connection",
    secret: true,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "RUNNER_ID",
    env: "RUNNER_ID",
    defaultValue: "",
    schema: optionalStringSchema,
    label: "Runner ID",
    description: "Runner UUID assigned by the hub.",
    category: "Hub connection",
    secret: false,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "CONTRIBUTOR_NAME",
    env: "CONTRIBUTOR_NAME",
    defaultValue: "anonymous",
    schema: nonEmptyStringSchema,
    label: "Contributor name",
    description: "Name or handle associated with runner contributions.",
    category: "Contributor identity",
    secret: false,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "PFG_GITHUB_TOKEN",
    env: "PFG_GITHUB_TOKEN",
    defaultValue: "",
    schema: optionalStringSchema,
    label: "GitHub token",
    description: "GitHub personal access token used to clone, push and open PRs.",
    category: "Contributor identity",
    secret: true,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "MODEL_PROVIDER",
    env: "MODEL_PROVIDER",
    defaultValue: "anthropic",
    schema: providerSchema,
    label: "Model provider",
    description: "LLM provider selected for runner execution.",
    category: "Model provider",
    secret: false,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "ANTHROPIC_API_KEY",
    env: "ANTHROPIC_API_KEY",
    defaultValue: "",
    schema: optionalStringSchema,
    label: "Anthropic API key",
    description: "Anthropic credential used when MODEL_PROVIDER is anthropic.",
    category: "Model provider",
    secret: true,
    valueType: "string",
    requiredForSetup: false,
  },
  {
    key: "OPENAI_API_KEY",
    env: "OPENAI_API_KEY",
    defaultValue: "",
    schema: optionalStringSchema,
    label: "OpenAI API key",
    description: "OpenAI credential used when MODEL_PROVIDER is openai.",
    category: "Model provider",
    secret: true,
    valueType: "string",
    requiredForSetup: false,
  },
  {
    key: "LLM_MODEL",
    env: "LLM_MODEL",
    defaultValue: "claude-sonnet-4-6",
    schema: nonEmptyStringSchema,
    label: "Model name",
    description: "Model name passed to the selected provider.",
    category: "Model provider",
    secret: false,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "MAX_TOKENS_PER_DAY",
    env: "MAX_TOKENS_PER_DAY",
    defaultValue: 100_000,
    schema: integerSchema(0),
    label: "Daily token budget",
    description: "Maximum runner token budget available per day.",
    category: "Budgets",
    secret: false,
    valueType: "integer",
    requiredForSetup: true,
  },
  {
    key: "MAX_RETRIES",
    env: "MAX_RETRIES",
    defaultValue: 3,
    schema: integerSchema(0, 20),
    label: "Maximum retries",
    description: "Maximum fix attempts per issue before the runner gives up.",
    category: "Budgets",
    secret: false,
    valueType: "integer",
    requiredForSetup: true,
  },
  {
    key: "RUNNER_PROJECT_PREFERENCES",
    env: "RUNNER_PROJECT_PREFERENCES",
    defaultValue: {
      languages: [],
      ecosystems: [],
      licenses: [],
      labels: [],
      allowRepos: [],
      blockRepos: [],
    },
    schema: runnerProjectPreferencesSchema,
    label: "Project preferences",
    description: "Structured dispatch preferences sent to the hub.",
    category: "Runner preferences",
    secret: false,
    valueType: "json",
    requiredForSetup: false,
  },
  {
    key: "SETUP_COMMANDS",
    env: "SETUP_COMMANDS",
    defaultValue: [],
    schema: commandListSchema,
    label: "Setup commands",
    description: "Optional setup commands to run before verification.",
    category: "Verification",
    secret: false,
    valueType: "json",
    requiredForSetup: false,
  },
  {
    key: "VERIFICATION_COMMANDS",
    env: "VERIFICATION_COMMANDS",
    defaultValue: [],
    schema: commandListSchema,
    label: "Verification commands",
    description: "Optional verification command override for runner execution.",
    category: "Verification",
    secret: false,
    valueType: "json",
    requiredForSetup: false,
  },
  {
    key: "WORK_DIR",
    env: "WORK_DIR",
    defaultValue: "/tmp/pfg-work",
    schema: nonEmptyStringSchema,
    label: "Work directory",
    description: "Local directory used for repository clones.",
    category: "Repository execution",
    secret: false,
    valueType: "string",
    requiredForSetup: true,
  },
  {
    key: "CLONE_DEPTH",
    env: "CLONE_DEPTH",
    defaultValue: 1,
    schema: integerSchema(1, 1000),
    label: "Clone depth",
    description: "Git clone depth used by runner repository checkouts.",
    category: "Repository execution",
    secret: false,
    valueType: "integer",
    requiredForSetup: true,
  },
  {
    key: "REPOSITORY_EXECUTION_LIMITS",
    env: "REPOSITORY_EXECUTION_LIMITS",
    defaultValue: {
      commandTimeoutSeconds: 600,
      networkPolicy: "default",
      maxProcesses: 32,
      cleanupProcesses: true,
      maxDiskMb: 4096,
    },
    schema: repositoryExecutionLimitsSchema,
    label: "Repository execution limits",
    description: "Structured limits for untrusted repository commands.",
    category: "Repository execution",
    secret: false,
    valueType: "json",
    requiredForSetup: false,
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

export const runtimeConfigCatalogByKey = new Map(
  RUNTIME_CONFIG_CATALOG.map((entry) => [entry.key, entry]),
);
