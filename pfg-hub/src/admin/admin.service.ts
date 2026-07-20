import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, ilike, or, SQL, sql } from "drizzle-orm";
import { DATABASE, Database } from "../db/database.module";
import { contributions, issues, repos, runners } from "../db/schema";
import { DispatchMetricsService } from "../dispatch-metrics/dispatch-metrics.service";
import {
  AdminListResponse,
  booleanFilter,
  ListQuery,
  parseListParams,
  stringFilter,
} from "./admin-listing";

const DB_RANKING_QUEUE_SIZE_THRESHOLD = 1000;
const DB_RANKING_P95_LATENCY_THRESHOLD_MS = 100;

export type AdminScoringOverview = {
  queueHealth: {
    queueSize: number;
    dispatchMatchingLatencySampleCount: number;
    dispatchMatchingLatencyMs: number | null;
    averageDispatchMatchingLatencyMs: number | null;
    p95DispatchMatchingLatencyMs: number | null;
    databaseRankingRecommended: boolean;
    databaseRankingThresholds: {
      queueSize: number;
      p95MatchingLatencyMs: number;
    };
  };
  recentRepositories: unknown[];
  recentIssues: unknown[];
};

@Injectable()
export class AdminService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(DispatchMetricsService)
    private readonly dispatchMetricsService: DispatchMetricsService,
  ) {}

  /** Builds the scoring workbench payload without making the frontend compose resources. */
  async getScoringOverview(): Promise<AdminScoringOverview> {
    const matchingLatency = this.dispatchMetricsService.snapshot();
    const [queueSize, recentRepositories, recentIssues] = await Promise.all([
      this.count(issues, eq(issues.status, "PENDING")),
      this.db
        .select({
          id: repos.id,
          owner: repos.owner,
          name: repos.name,
          language: repos.language,
          stars: repos.stars,
          eligible: repos.eligible,
          score: repos.score,
          scoreDiagnostic: repos.scoreDiagnostic,
          lastCrawledAt: repos.lastCrawledAt,
          createdAt: repos.createdAt,
        })
        .from(repos)
        .orderBy(desc(repos.createdAt))
        .limit(12),
      this.db
        .select({
          id: issues.id,
          repoOwner: repos.owner,
          repoName: repos.name,
          title: issues.title,
          status: issues.status,
          difficulty: issues.difficulty,
          estimatedMinutes: issues.estimatedMinutes,
          score: issues.score,
          scoreDiagnostic: issues.scoreDiagnostic,
          createdAt: issues.createdAt,
          updatedAt: issues.updatedAt,
        })
        .from(issues)
        .innerJoin(repos, eq(issues.repoId, repos.id))
        .orderBy(desc(issues.createdAt))
        .limit(12),
    ]);

    const p95Latency = matchingLatency.p95MatchingLatencyMs;
    return {
      queueHealth: {
        queueSize,
        dispatchMatchingLatencySampleCount: matchingLatency.sampleCount,
        dispatchMatchingLatencyMs: matchingLatency.lastMatchingLatencyMs,
        averageDispatchMatchingLatencyMs: matchingLatency.averageMatchingLatencyMs,
        p95DispatchMatchingLatencyMs: p95Latency,
        databaseRankingRecommended:
          queueSize > DB_RANKING_QUEUE_SIZE_THRESHOLD ||
          (p95Latency !== null &&
            p95Latency >= DB_RANKING_P95_LATENCY_THRESHOLD_MS),
        databaseRankingThresholds: {
          queueSize: DB_RANKING_QUEUE_SIZE_THRESHOLD,
          p95MatchingLatencyMs: DB_RANKING_P95_LATENCY_THRESHOLD_MS,
        },
      },
      recentRepositories,
      recentIssues,
    };
  }

  /** Lists repositories with the filtering and pagination contract used by React-admin. */
  async listRepositories(
    query: ListQuery,
  ): Promise<AdminListResponse<unknown>> {
    const params = parseListParams(query, "score");
    const search = stringFilter(params.filter.q);
    const eligible = booleanFilter(params.filter.eligible);
    const where = and(
      search
        ? or(
            ilike(repos.owner, `%${search}%`),
            ilike(repos.name, `%${search}%`),
            ilike(repos.githubUrl, `%${search}%`),
          )
        : undefined,
      eligible === undefined ? undefined : eq(repos.eligible, eligible),
    );
    const sortColumns = {
      owner: repos.owner,
      name: repos.name,
      language: repos.language,
      stars: repos.stars,
      score: repos.score,
      eligible: repos.eligible,
      lastCrawledAt: repos.lastCrawledAt,
      createdAt: repos.createdAt,
    };
    const orderColumn =
      sortColumns[params.field as keyof typeof sortColumns] ?? repos.score;

    const [data, total] = await Promise.all([
      this.db
        .select()
        .from(repos)
        .where(where)
        .orderBy(params.descending ? desc(orderColumn) : asc(orderColumn))
        .limit(params.limit)
        .offset(params.start),
      this.count(repos, where),
    ]);
    return { data, total };
  }

  /** Lists issues while preserving the fields displayed by the administration table. */
  async listIssues(query: ListQuery): Promise<AdminListResponse<unknown>> {
    const params = parseListParams(query, "score");
    const search = stringFilter(params.filter.q);
    const status = stringFilter(params.filter.status);
    const difficulty = stringFilter(params.filter.difficulty);
    const where = and(
      search
        ? or(
            ilike(issues.title, `%${search}%`),
            ilike(issues.body, `%${search}%`),
            ilike(issues.githubUrl, `%${search}%`),
          )
        : undefined,
      status
        ? eq(issues.status, status as typeof issues.status._.data)
        : undefined,
      difficulty
        ? eq(issues.difficulty, difficulty as typeof issues.difficulty._.data)
        : undefined,
    );
    const sortColumns = {
      title: issues.title,
      status: issues.status,
      difficulty: issues.difficulty,
      score: issues.score,
      estimatedMinutes: issues.estimatedMinutes,
      retryCount: issues.retryCount,
      createdAt: issues.createdAt,
      updatedAt: issues.updatedAt,
    };
    const orderColumn =
      sortColumns[params.field as keyof typeof sortColumns] ?? issues.score;

    const [data, total] = await Promise.all([
      this.db
        .select()
        .from(issues)
        .where(where)
        .orderBy(params.descending ? desc(orderColumn) : asc(orderColumn))
        .limit(params.limit)
        .offset(params.start),
      this.count(issues, where),
    ]);
    return { data, total };
  }

  /** Lists runners without exposing authentication tokens or internal preferences. */
  async listRunners(query: ListQuery): Promise<AdminListResponse<unknown>> {
    const params = parseListParams(query, "lastSeenAt");
    const search = stringFilter(params.filter.q);
    const active = booleanFilter(params.filter.active);
    const where = and(
      search ? ilike(runners.contributorName, `%${search}%`) : undefined,
      active === undefined ? undefined : eq(runners.active, active),
    );
    const sortColumns = {
      contributorName: runners.contributorName,
      quotaRemainingToday: runners.quotaRemainingToday,
      lastSeenAt: runners.lastSeenAt,
      active: runners.active,
      createdAt: runners.createdAt,
    };
    const orderColumn =
      sortColumns[params.field as keyof typeof sortColumns] ??
      runners.lastSeenAt;

    const [data, total] = await Promise.all([
      this.db
        .select({
          id: runners.id,
          contributorName: runners.contributorName,
          quotaRemainingToday: runners.quotaRemainingToday,
          lastSeenAt: runners.lastSeenAt,
          active: runners.active,
          createdAt: runners.createdAt,
        })
        .from(runners)
        .where(where)
        .orderBy(params.descending ? desc(orderColumn) : asc(orderColumn))
        .limit(params.limit)
        .offset(params.start),
      this.count(runners, where),
    ]);
    return { data, total };
  }

  /** Lists contribution audit entries with status and free-text filtering. */
  async listContributions(
    query: ListQuery,
  ): Promise<AdminListResponse<unknown>> {
    const params = parseListParams(query, "createdAt");
    const search = stringFilter(params.filter.q);
    const status = stringFilter(params.filter.status);
    const where = and(
      search
        ? or(
            ilike(contributions.issueId, `%${search}%`),
            ilike(contributions.runnerId, `%${search}%`),
            ilike(contributions.prUrl, `%${search}%`),
          )
        : undefined,
      status
        ? eq(contributions.status, status as typeof contributions.status._.data)
        : undefined,
    );
    const sortColumns = {
      status: contributions.status,
      issueId: contributions.issueId,
      runnerId: contributions.runnerId,
      tokensUsed: contributions.tokensUsed,
      createdAt: contributions.createdAt,
    };
    const orderColumn =
      sortColumns[params.field as keyof typeof sortColumns] ??
      contributions.createdAt;

    const [data, total] = await Promise.all([
      this.db
        .select()
        .from(contributions)
        .where(where)
        .orderBy(params.descending ? desc(orderColumn) : asc(orderColumn))
        .limit(params.limit)
        .offset(params.start),
      this.count(contributions, where),
    ]);
    return { data, total };
  }

  /** Counts rows using the same predicate as the corresponding paginated query. */
  private async count(
    table: typeof repos | typeof issues | typeof runners | typeof contributions,
    where: SQL | undefined,
  ): Promise<number> {
    const query = this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(table);
    const [row] = where ? await query.where(where) : await query;
    return Number(row.value);
  }
}
