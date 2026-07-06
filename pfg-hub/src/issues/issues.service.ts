import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { APP_CONFIG, AppConfig } from "../config";
import { DATABASE, Database } from "../db/database.module";
import { contributions, Issue, issues, repos } from "../db/schema";
import { DoneRequestDto, IssueDto } from "../openapi/dtos";
import { RunnersService } from "../runners/runners.service";

type IssueWithRepo = Issue & { repoUrl: string };

@Injectable()
export class IssuesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RunnersService)
    private readonly runnersService: RunnersService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
  ) {}

  /** Returns the highest-priority pending issue available to a valid runner. */
  async getNextIssue(runnerToken: string): Promise<IssueDto | null> {
    await this.runnersService.validateToken(runnerToken);

    const [row] = await this.db
      .select({ issue: issues, repoUrl: repos.githubUrl })
      .from(issues)
      .innerJoin(repos, eq(issues.repoId, repos.id))
      .where(eq(issues.status, "PENDING"))
      .orderBy(desc(issues.score), asc(issues.createdAt))
      .limit(1);

    return row ? this.toDto({ ...row.issue, repoUrl: row.repoUrl }) : null;
  }

  /** Atomically assigns a pending issue to the authenticated runner. */
  async claimIssue(id: string, runnerToken: string): Promise<IssueDto> {
    const runner = await this.runnersService.validateToken(runnerToken);
    const now = new Date();

    const [claimed] = await this.db
      .update(issues)
      .set({
        status: "CLAIMED",
        claimedBy: runner.id,
        claimedAt: now,
        updatedAt: now,
      })
      .where(and(eq(issues.id, id), eq(issues.status, "PENDING")))
      .returning();

    if (!claimed) {
      const [existing] = await this.db
        .select()
        .from(issues)
        .where(eq(issues.id, id))
        .limit(1);
      if (!existing) throw new NotFoundException("Issue not found");
      throw new ConflictException("Issue already claimed or completed");
    }

    return this.getIssueDtoById(claimed.id);
  }

  /** Records runner completion, retry state and the contribution audit row. */
  async reportDone(
    id: string,
    runnerToken: string,
    request: DoneRequestDto,
  ): Promise<void> {
    const runner = await this.runnersService.validateToken(runnerToken);
    const [issue] = await this.db
      .select()
      .from(issues)
      .where(eq(issues.id, id))
      .limit(1);

    if (!issue) throw new NotFoundException("Issue not found");
    if (issue.claimedBy !== runner.id)
      throw new UnauthorizedException("Issue not claimed by this runner");

    const retryCount = request.success
      ? issue.retryCount
      : issue.retryCount + 1;
    const nextStatus =
      !request.success && retryCount < this.config.issueMaxRetries
        ? "PENDING"
        : request.success
          ? "DONE"
          : "FAILED";

    await this.db.transaction(async (tx) => {
      await tx
        .update(issues)
        .set({
          status: nextStatus,
          retryCount,
          updatedAt: new Date(),
        })
        .where(eq(issues.id, id));

      await tx.insert(contributions).values({
        id: randomUUID(),
        issueId: issue.id,
        runnerId: runner.id,
        prUrl: request.prUrl ?? null,
        status: request.success ? "SUCCESS" : "FAILED",
        tokensUsed: request.tokensUsed ?? null,
        errorMessage: request.errorMessage ?? null,
      });
    });
  }

  /** Reloads an issue with repository context before returning it to clients. */
  private async getIssueDtoById(id: string): Promise<IssueDto> {
    const [row] = await this.db
      .select({ issue: issues, repoUrl: repos.githubUrl })
      .from(issues)
      .innerJoin(repos, eq(issues.repoId, repos.id))
      .where(eq(issues.id, id))
      .limit(1);

    if (!row) throw new NotFoundException("Issue not found");
    return this.toDto({ ...row.issue, repoUrl: row.repoUrl });
  }

  /** Converts database issue rows into the public API representation. */
  private toDto(issue: IssueWithRepo): IssueDto {
    return {
      id: issue.id,
      githubId: issue.githubId,
      title: issue.title,
      body: issue.body,
      githubUrl: issue.githubUrl,
      repoUrl: issue.repoUrl,
      labels: issue.labels ?? "",
      score: issue.score,
      status: issue.status,
      claimedBy: issue.claimedBy,
      claimedAt: issue.claimedAt?.toISOString() ?? null,
      retryCount: issue.retryCount,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    };
  }
}
