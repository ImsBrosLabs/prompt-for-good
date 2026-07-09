import { ApiProperty, ApiPropertyOptional } from "@nestjs/swagger";

export const issueStatuses = ["PENDING", "CLAIMED", "DONE", "FAILED"] as const;
export const ingestionRunStatuses = [
  "STARTED",
  "SUCCESS",
  "PARTIAL_SUCCESS",
  "FAILED",
  "RATE_LIMITED",
] as const;

export class RegisterRequestDto {
  @ApiProperty({
    description: "GitHub username or display name of the contributor",
    example: "octocat",
    type: String,
  })
  contributorName!: string;
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
