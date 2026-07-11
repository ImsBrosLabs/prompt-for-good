import { Inject, Injectable } from "@nestjs/common";
import { and, asc, desc, eq, ilike, or, SQL, sql } from "drizzle-orm";
import { DATABASE, Database } from "../db/database.module";
import { contributions, issues, repos, runners } from "../db/schema";

type ListQuery = {
  sort?: string;
  range?: string;
  filter?: string;
};

type ListParams = {
  start: number;
  limit: number;
  field: string;
  descending: boolean;
  filter: Record<string, unknown>;
};

export type AdminListResponse<RecordType> = {
  data: RecordType[];
  total: number;
};

@Injectable()
export class AdminService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Lists repositories with the filtering and pagination contract used by React-admin. */
  async listRepositories(
    query: ListQuery,
  ): Promise<AdminListResponse<unknown>> {
    const params = this.parseListParams(query, "score");
    const search = this.stringFilter(params.filter.q);
    const eligible = this.booleanFilter(params.filter.eligible);
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
    const params = this.parseListParams(query, "score");
    const search = this.stringFilter(params.filter.q);
    const status = this.stringFilter(params.filter.status);
    const difficulty = this.stringFilter(params.filter.difficulty);
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
    const params = this.parseListParams(query, "lastSeenAt");
    const search = this.stringFilter(params.filter.q);
    const active = this.booleanFilter(params.filter.active);
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
    const params = this.parseListParams(query, "createdAt");
    const search = this.stringFilter(params.filter.q);
    const status = this.stringFilter(params.filter.status);
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

  /** Parses untrusted React-admin query JSON and clamps ranges to a bounded page size. */
  private parseListParams(query: ListQuery, defaultSort: string): ListParams {
    const sort = this.parseTuple(query.sort);
    const range = this.parseTuple(query.range);
    const parsedFilter = this.parseJson(query.filter);
    const start = this.nonNegativeInteger(range?.[0], 0);
    const requestedEnd = this.nonNegativeInteger(range?.[1], start + 24);
    const end = Math.max(start, requestedEnd);

    return {
      start,
      limit: Math.min(end - start + 1, 100),
      field: typeof sort?.[0] === "string" ? sort[0] : defaultSort,
      descending: String(sort?.[1] ?? "DESC").toUpperCase() === "DESC",
      filter:
        typeof parsedFilter === "object" &&
        parsedFilter !== null &&
        !Array.isArray(parsedFilter)
          ? (parsedFilter as Record<string, unknown>)
          : {},
    };
  }

  /** Parses a JSON query parameter without allowing malformed input to fail the request. */
  private parseJson(value: string | undefined): unknown {
    if (!value) return undefined;
    try {
      return JSON.parse(value) as unknown;
    } catch {
      return undefined;
    }
  }

  private parseTuple(value: string | undefined): unknown[] | undefined {
    const parsed = this.parseJson(value);
    return Array.isArray(parsed) ? parsed : undefined;
  }

  private nonNegativeInteger(value: unknown, fallback: number): number {
    return typeof value === "number" && Number.isInteger(value) && value >= 0
      ? value
      : fallback;
  }

  private stringFilter(value: unknown): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private booleanFilter(value: unknown): boolean | undefined {
    return typeof value === "boolean" ? value : undefined;
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
