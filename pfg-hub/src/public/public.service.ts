import { Inject, Injectable } from "@nestjs/common";
import { and, desc, eq, ilike, or, SQL, sql } from "drizzle-orm";
import { DATABASE, Database } from "../db/database.module";
import { contributions, repos } from "../db/schema";
import {
  PublicRepoDto,
  PublicRepoListResponseDto,
  TokenUsageResponseDto,
} from "../openapi/dtos";

type PublicRepoQuery = {
  limit?: string;
  offset?: string;
  q?: string;
  eligible?: string;
};

@Injectable()
export class PublicService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Lists public repository metadata with bounded pagination and simple filters. */
  async listRepos(query: PublicRepoQuery): Promise<PublicRepoListResponseDto> {
    const limit = this.positiveInteger(query.limit, 20, 100);
    const offset = this.nonNegativeInteger(query.offset, 0);
    const search = this.stringFilter(query.q);
    const eligible = this.booleanFilter(query.eligible);
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

    const [data, total] = await Promise.all([
      this.db
        .select({
          id: repos.id,
          githubUrl: repos.githubUrl,
          owner: repos.owner,
          name: repos.name,
          language: repos.language,
          ecosystems: repos.ecosystems,
          license: repos.license,
          ciDetected: repos.ciDetected,
          testsDetected: repos.testsDetected,
          lastPushedAt: repos.lastPushedAt,
          score: repos.score,
          stars: repos.stars,
          eligible: repos.eligible,
          lastCrawledAt: repos.lastCrawledAt,
          createdAt: repos.createdAt,
        })
        .from(repos)
        .where(where)
        .orderBy(desc(repos.score), desc(repos.stars), desc(repos.createdAt))
        .limit(limit)
        .offset(offset),
      this.countRepos(where),
    ]);

    return { data: data as PublicRepoDto[], total };
  }

  /** Aggregates contribution outcomes and token consumption without exposing row details. */
  async getTokenUsage(): Promise<TokenUsageResponseDto> {
    const [row] = await this.db
      .select({
        totalTokensUsed: sql<number>`coalesce(sum(${contributions.tokensUsed}), 0)::bigint`,
        successfulContributions: sql<number>`count(*) filter (where ${contributions.status} = 'SUCCESS')::int`,
        failedContributions: sql<number>`count(*) filter (where ${contributions.status} = 'FAILED')::int`,
      })
      .from(contributions);

    return {
      totalTokensUsed: Number(row.totalTokensUsed),
      successfulContributions: Number(row.successfulContributions),
      failedContributions: Number(row.failedContributions),
    };
  }

  private positiveInteger(
    value: string | undefined,
    fallback: number,
    maximum: number,
  ): number {
    const parsed = Number(value);
    if (!Number.isInteger(parsed) || parsed <= 0) return fallback;
    return Math.min(parsed, maximum);
  }

  private nonNegativeInteger(value: string | undefined, fallback: number): number {
    const parsed = Number(value);
    return Number.isInteger(parsed) && parsed >= 0 ? parsed : fallback;
  }

  private stringFilter(value: string | undefined): string | undefined {
    return typeof value === "string" && value.trim() ? value.trim() : undefined;
  }

  private booleanFilter(value: string | undefined): boolean | undefined {
    if (value === "true") return true;
    if (value === "false") return false;
    return undefined;
  }

  /** Counts public repository rows with the same predicate as the paginated query. */
  private async countRepos(where: SQL | undefined): Promise<number> {
    const query = this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(repos);
    const [row] = where ? await query.where(where) : await query;
    return Number(row.value);
  }
}
