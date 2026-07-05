import { Inject, Injectable } from "@nestjs/common";
import { eq, sql } from "drizzle-orm";
import { DATABASE, Database } from "../db/database.module";
import { contributions, issues, repos, runners } from "../db/schema";
import { StatsResponseDto } from "../openapi/dtos";

@Injectable()
export class StatsService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Aggregates the counters displayed by the public stats endpoint. */
  async getStats(): Promise<StatsResponseDto> {
    const [
      totalRepos,
      eligibleRepos,
      totalIssues,
      pendingIssues,
      claimedIssues,
      doneIssues,
      failedIssues,
      totalPrsOpened,
      activeRunners,
    ] = await Promise.all([
      this.count(repos),
      this.count(repos, eq(repos.eligible, true)),
      this.count(issues),
      this.count(issues, eq(issues.status, "PENDING")),
      this.count(issues, eq(issues.status, "CLAIMED")),
      this.count(issues, eq(issues.status, "DONE")),
      this.count(issues, eq(issues.status, "FAILED")),
      this.count(contributions),
      this.count(runners, eq(runners.active, true)),
    ]);

    return {
      totalRepos,
      eligibleRepos,
      totalIssues,
      pendingIssues,
      claimedIssues,
      doneIssues,
      failedIssues,
      totalPrsOpened,
      activeRunners,
    };
  }

  /** Counts rows from a known table, optionally applying a Drizzle predicate. */
  private async count(
    table: typeof repos | typeof issues | typeof contributions | typeof runners,
    where?: ReturnType<typeof eq>,
  ): Promise<number> {
    const query = this.db
      .select({ value: sql<number>`count(*)::int` })
      .from(table);
    const [row] = where ? await query.where(where) : await query;
    return Number(row.value);
  }
}
