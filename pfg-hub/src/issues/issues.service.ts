import {
  ConflictException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, asc, desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config";
import { DATABASE, Database } from "../db/database.module";
import { contributions, Issue, issues, repos } from "../db/schema";
import { RunnersService } from "../runners/runners.service";
import { components } from "../types/openapi";

type DoneRequest = components["schemas"]["DoneRequest"];
type IssueDto = components["schemas"]["IssueDto"];
type IssueWithRepo = Issue & { repoUrl: string };

@Injectable()
export class IssuesService {
  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RunnersService)
    private readonly runnersService: RunnersService,
  ) {}

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

  async reportDone(
    id: string,
    runnerToken: string,
    request: DoneRequest,
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
      !request.success && retryCount < loadConfig().issueMaxRetries
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
