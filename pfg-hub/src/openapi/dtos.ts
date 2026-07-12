import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";
import { IssueDifficulty, RunnerPreferences } from "../db/schema";

export const issueStatuses = ["PENDING", "CLAIMED", "DONE", "FAILED"] as const;
export const ingestionRunStatuses = [
  "STARTED",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FAILED",
  "RATE_LIMITED",
] as const;
export const issueDifficulties = ["easy", "medium", "hard"] as const;
export const runtimeConfigSources = [
  "database",
  "environment",
  "default",
] as const;
export const runtimeConfigValueTypes = [
  "boolean",
  "integer",
  "string",
] as const;
const runtimeConfigValueSchema = [
  { type: "boolean" as const },
  { type: "integer" as const },
  { type: "string" as const },
];
const nullableRuntimeConfigValueSchema = [
  ...runtimeConfigValueSchema,
  { type: "null" as const },
];

export class RunnerPreferencesDto implements RunnerPreferences {
  @ApiPropertyOptional({ example: ["owner/repo"], type: [String] })
  allowedRepos?: string[];

  @ApiPropertyOptional({ example: ["owner/repo-to-avoid"], type: [String] })
  blockedRepos?: string[];

  @ApiPropertyOptional({ example: ["typescript", "python"], type: [String] })
  languages?: string[];

  @ApiPropertyOptional({ example: ["npm", "pip"], type: [String] })
  ecosystems?: string[];

  @ApiPropertyOptional({ example: ["MIT", "Apache-2.0"], type: [String] })
  licenses?: string[];

  @ApiPropertyOptional({ example: ["bug", "good first issue"], type: [String] })
  labels?: string[];

  @ApiPropertyOptional({ enum: issueDifficulties, type: String })
  maxDifficulty?: IssueDifficulty;

  @ApiPropertyOptional({ example: 120, format: "int32", type: Number })
  maxEstimatedMinutes?: number;
}

export class RegisterRequestDto {
  @ApiProperty({
    description: "GitHub username or display name of the contributor",
    example: "octocat",
    type: String,
  })
  contributorName!: string;

  @ApiPropertyOptional({
    description:
      "Work-selection criteria persisted for preference-aware dispatch",
    type: RunnerPreferencesDto,
  })
  preferences?: RunnerPreferences;
}

export class RegisterResponseDto {
  @ApiPropertyOptional({
    description: "Generated UUID identifying this runner",
    example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    type: String,
  })
  runnerId?: string;

  @ApiPropertyOptional({
    description:
      "Permanent bearer token to pass as X-Runner-Token on every subsequent request",
    example: "f1e2d3c4-b5a6-9870-fedc-ba9876543210",
    type: String,
  })
  token?: string;
}

export class HeartbeatRequestDto {
  @ApiProperty({
    description: "Claude API tokens remaining in the runner's daily quota",
    example: 50000,
    format: "int64",
    type: Number,
  })
  quotaRemainingToday!: number;

  @ApiPropertyOptional({
    description: "Optional replacement work-selection criteria for this runner",
    type: RunnerPreferencesDto,
  })
  preferences?: RunnerPreferences;
}

export class DoneRequestDto {
  @ApiProperty({
    description: "Whether the runner succeeded in opening a pull request",
    type: Boolean,
  })
  success!: boolean;

  @ApiPropertyOptional({
    description: "URL of the opened pull request",
    example: "https://github.com/owner/repo/pull/42",
    nullable: true,
    type: String,
  })
  prUrl?: string | null;

  @ApiPropertyOptional({
    description: "Total Claude tokens consumed during the work session",
    example: 12500,
    format: "int64",
    nullable: true,
    type: Number,
  })
  tokensUsed?: number | null;

  @ApiPropertyOptional({
    description: "Human-readable error message when success is false",
    nullable: true,
    type: String,
  })
  errorMessage?: string | null;

  @ApiPropertyOptional({
    additionalProperties: true,
    description:
      "Structured runner report with phase outcomes, verification logs and pull request diagnostics",
    nullable: true,
    type: Object,
  })
  details?: Record<string, unknown> | null;
}

export class IssueDto {
  @ApiPropertyOptional({
    description: "Internal UUID of the issue",
    type: String,
  })
  id?: string;

  @ApiPropertyOptional({
    description: "GitHub issue number",
    format: "int64",
    type: Number,
  })
  githubId?: number;

  @ApiPropertyOptional({ description: "Issue title", type: String })
  title?: string;

  @ApiPropertyOptional({
    description: "Issue description (Markdown)",
    nullable: true,
    type: String,
  })
  body?: string | null;

  @ApiPropertyOptional({
    description: "Direct URL to the GitHub issue",
    example: "https://github.com/owner/repo/issues/42",
    type: String,
  })
  githubUrl?: string;

  @ApiPropertyOptional({
    description: "GitHub URL of the repository containing this issue",
    example: "https://github.com/owner/repo",
    type: String,
  })
  repoUrl?: string;

  @ApiPropertyOptional({
    description: "Comma-separated list of GitHub labels",
    example: "bug,good first issue",
    type: String,
  })
  labels?: string;

  @ApiPropertyOptional({
    description: "Computed priority score (higher is better)",
    example: 85,
    format: "int32",
    type: Number,
  })
  score?: number;

  @ApiPropertyOptional({
    description: "Estimated implementation difficulty",
    enum: issueDifficulties,
    type: String,
  })
  difficulty?: IssueDifficulty;

  @ApiPropertyOptional({
    description: "Estimated implementation time in minutes",
    example: 90,
    format: "int32",
    type: Number,
  })
  estimatedMinutes?: number;

  @ApiPropertyOptional({
    description: "Lifecycle state of an issue in the queue",
    enum: issueStatuses,
    type: String,
  })
  status?: (typeof issueStatuses)[number];

  @ApiPropertyOptional({
    description: "UUID of the runner that claimed this issue",
    nullable: true,
    type: String,
  })
  claimedBy?: string | null;

  @ApiPropertyOptional({
    description: "Timestamp when the issue was claimed (ISO-8601)",
    format: "date-time",
    nullable: true,
    type: String,
  })
  claimedAt?: string | null;

  @ApiPropertyOptional({
    description: "Number of failed attempts so far",
    example: 0,
    format: "int32",
    type: Number,
  })
  retryCount?: number;

  @ApiPropertyOptional({
    description: "Timestamp when the issue was ingested (ISO-8601)",
    format: "date-time",
    type: String,
  })
  createdAt?: string;

  @ApiPropertyOptional({
    description: "Timestamp of the last status change (ISO-8601)",
    format: "date-time",
    type: String,
  })
  updatedAt?: string;
}

export class StatsResponseDto {
  @ApiPropertyOptional({ example: 42, format: "int64", type: Number })
  totalRepos?: number;

  @ApiPropertyOptional({ example: 30, format: "int64", type: Number })
  eligibleRepos?: number;

  @ApiPropertyOptional({ example: 1500, format: "int64", type: Number })
  totalIssues?: number;

  @ApiPropertyOptional({ example: 200, format: "int64", type: Number })
  pendingIssues?: number;

  @ApiPropertyOptional({
    description: "Current dispatch queue size, equal to pending issues",
    example: 200,
    format: "int64",
    type: Number,
  })
  queueSize?: number;

  @ApiPropertyOptional({ example: 10, format: "int64", type: Number })
  claimedIssues?: number;

  @ApiPropertyOptional({ example: 800, format: "int64", type: Number })
  doneIssues?: number;

  @ApiPropertyOptional({ example: 50, format: "int64", type: Number })
  failedIssues?: number;

  @ApiPropertyOptional({ example: 850, format: "int64", type: Number })
  totalPrsOpened?: number;

  @ApiPropertyOptional({ example: 5, format: "int64", type: Number })
  activeRunners?: number;

  @ApiPropertyOptional({ example: 12, format: "int32", type: Number })
  dispatchMatchingLatencySampleCount?: number;

  @ApiPropertyOptional({
    description: "Most recent in-memory dispatch matching latency in ms",
    example: 24,
    nullable: true,
    type: Number,
  })
  dispatchMatchingLatencyMs?: number | null;

  @ApiPropertyOptional({
    description: "Average recent in-memory dispatch matching latency in ms",
    example: 18,
    nullable: true,
    type: Number,
  })
  averageDispatchMatchingLatencyMs?: number | null;

  @ApiPropertyOptional({
    description: "P95 recent in-memory dispatch matching latency in ms",
    example: 42,
    nullable: true,
    type: Number,
  })
  p95DispatchMatchingLatencyMs?: number | null;
}

export class PublicRepoDto {
  @ApiProperty({ description: "Internal repository UUID", type: String })
  id!: string;

  @ApiProperty({
    description: "GitHub URL of the repository",
    example: "https://github.com/owner/repo",
    type: String,
  })
  githubUrl!: string;

  @ApiProperty({ example: "owner", type: String })
  owner!: string;

  @ApiProperty({ example: "repo", type: String })
  name!: string;

  @ApiPropertyOptional({ example: "TypeScript", nullable: true, type: String })
  language!: string | null;

  @ApiProperty({ example: ["node"], isArray: true, type: String })
  ecosystems!: string[];

  @ApiPropertyOptional({ example: "MIT", nullable: true, type: String })
  license!: string | null;

  @ApiProperty({ type: Boolean })
  ciDetected!: boolean;

  @ApiProperty({ type: Boolean })
  testsDetected!: boolean;

  @ApiPropertyOptional({
    format: "date-time",
    nullable: true,
    type: String,
  })
  lastPushedAt!: Date | null;

  @ApiProperty({ example: 82, format: "int32", type: Number })
  score!: number;

  @ApiProperty({ example: 1200, format: "int32", type: Number })
  stars!: number;

  @ApiProperty({ type: Boolean })
  eligible!: boolean;

  @ApiPropertyOptional({
    format: "date-time",
    nullable: true,
    type: String,
  })
  lastCrawledAt!: Date | null;

  @ApiProperty({ format: "date-time", type: String })
  createdAt!: Date;
}

export class PublicRepoListResponseDto {
  @ApiProperty({ type: [PublicRepoDto] })
  data!: PublicRepoDto[];

  @ApiProperty({ example: 42, format: "int32", type: Number })
  total!: number;
}

export class TokenUsageResponseDto {
  @ApiProperty({ example: 125000, format: "int64", type: Number })
  totalTokensUsed!: number;

  @ApiProperty({ example: 24, format: "int32", type: Number })
  successfulContributions!: number;

  @ApiProperty({ example: 3, format: "int32", type: Number })
  failedContributions!: number;
}

export class IngestionRunDto {
  @ApiPropertyOptional({ description: "Ingestion run UUID", type: String })
  id?: string;

  @ApiPropertyOptional({
    description: "Ingestion run status",
    enum: ingestionRunStatuses,
    type: String,
  })
  status?: (typeof ingestionRunStatuses)[number];

  @ApiPropertyOptional({ example: 12, format: "int32", type: Number })
  discoveredRepos?: number;

  @ApiPropertyOptional({ example: 8, format: "int32", type: Number })
  seededRepos?: number;

  @ApiPropertyOptional({ example: 3, format: "int32", type: Number })
  recrawledRepos?: number;

  @ApiPropertyOptional({ example: 24, format: "int32", type: Number })
  createdIssues?: number;

  @ApiPropertyOptional({ example: 2, format: "int32", type: Number })
  skippedPullRequests?: number;

  @ApiPropertyOptional({ example: 1, format: "int32", type: Number })
  failedRepositories?: number;

  @ApiPropertyOptional({
    description: "Structured per-label, per-repository and rate-limit details",
    type: Object,
  })
  details?: Record<string, unknown>;

  @ApiPropertyOptional({
    description: "Error message for failed or rate-limited runs",
    nullable: true,
    type: String,
  })
  errorMessage?: string | null;

  @ApiPropertyOptional({
    description: "Timestamp when the ingestion run started (ISO-8601)",
    format: "date-time",
    type: String,
  })
  startedAt?: string;

  @ApiPropertyOptional({
    description: "Timestamp when the ingestion run finished (ISO-8601)",
    format: "date-time",
    nullable: true,
    type: String,
  })
  finishedAt?: string | null;
}

export class RuntimeConfigMetadataDto {
  @ApiProperty({ example: "ISSUE_MIN_SCORE", type: String })
  env!: string;

  @ApiProperty({ example: "Minimum issue score", type: String })
  label!: string;

  @ApiProperty({
    example:
      "Minimum score required to add a discovered GitHub issue to the work queue.",
    type: String,
  })
  description!: string;

  @ApiProperty({ example: "Issues", type: String })
  category!: string;

  @ApiProperty({
    description: "Whether the effective value is hidden in admin responses",
    type: Boolean,
  })
  secret!: boolean;

  @ApiProperty({ enum: runtimeConfigValueTypes, type: String })
  valueType!: (typeof runtimeConfigValueTypes)[number];

  @ApiProperty({
    description: "Catalog fallback value, hidden as null when secret is true",
    oneOf: nullableRuntimeConfigValueSchema,
    type: Array,
  })
  defaultValue!: unknown;
}

export class RuntimeConfigItemDto {
  @ApiProperty({ example: "issueMinScore", type: String })
  id!: string;

  @ApiProperty({ example: "issueMinScore", type: String })
  key!: string;

  @ApiProperty({
    description: "Effective value, hidden as null when secret is true",
    oneOf: nullableRuntimeConfigValueSchema,
    type: Array,
  })
  value!: unknown;

  @ApiProperty({
    description:
      "Raw environment variable value for this catalog entry, hidden as null when secret is true or unset",
    nullable: true,
    type: String,
  })
  environmentValue!: string | null;

  @ApiProperty({ enum: runtimeConfigSources, type: String })
  source!: (typeof runtimeConfigSources)[number];

  @ApiProperty({ type: Boolean })
  hasDatabaseOverride!: boolean;

  @ApiProperty({ format: "date-time", nullable: true, type: String })
  updatedAt!: string | null;

  @ApiProperty({ nullable: true, type: String })
  updatedBy!: string | null;

  @ApiProperty({ type: RuntimeConfigMetadataDto })
  metadata!: RuntimeConfigMetadataDto;
}

export class RuntimeConfigListResponseDto {
  @ApiProperty({ type: [RuntimeConfigItemDto] })
  data!: RuntimeConfigItemDto[];

  @ApiProperty({ example: 10, format: "int32", type: Number })
  total!: number;
}

export class RuntimeConfigUpdateRequestDto {
  @ApiProperty({
    description: "JSON value validated by the catalog schema for this key",
    oneOf: runtimeConfigValueSchema,
    type: Array,
  })
  value!: unknown;
}

export class GitHubDiscoveryResultDto {
  @ApiPropertyOptional({
    description: "Labels searched during discovery",
    example: ["good first issue", "help wanted"],
    isArray: true,
    type: String,
  })
  searchedLabels?: string[];

  @ApiPropertyOptional({ example: 12, format: "int32", type: Number })
  discoveredRepos?: number;

  @ApiPropertyOptional({ example: 8, format: "int32", type: Number })
  seededRepos?: number;

  @ApiPropertyOptional({ example: 3, format: "int32", type: Number })
  recrawledRepos?: number;

  @ApiPropertyOptional({ example: 24, format: "int32", type: Number })
  createdIssues?: number;

  @ApiPropertyOptional({ example: 2, format: "int32", type: Number })
  skippedPullRequests?: number;

  @ApiPropertyOptional({ example: 1, format: "int32", type: Number })
  failedRepositories?: number;

  @ApiPropertyOptional({
    description: "Structured per-label, per-repository and rate-limit details",
    type: Object,
  })
  details?: Record<string, unknown>;

  @ApiPropertyOptional({ description: "Ingestion run UUID", type: String })
  runId?: string;
}

export class IngestionRunStartedDto {
  @ApiProperty({
    description:
      "Ingestion run UUID. Poll GET /seed/ingestion-runs/{runId} for completion.",
    example: "a1b2c3d4-e5f6-7890-abcd-ef1234567890",
    type: String,
  })
  runId!: string;
}

export class HealthResponseDto {
  @ApiProperty({ example: "UP", type: String })
  status!: string;
}
