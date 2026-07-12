import {
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, asc, desc, eq, lt } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DATABASE, Database } from "../db/database.module";
import { contributions, Issue, issues, repos, Runner } from "../db/schema";
import { DispatchMetricsService } from "../dispatch-metrics/dispatch-metrics.service";
import { DoneRequestDto, IssueDto } from "../openapi/dtos";
import { RuntimeConfigService } from "../runtime-config/runtime-config.service";
import { RunnersService } from "../runners/runners.service";
import { ScoringDiagnostic, ScoringService } from "../scoring/scoring.service";

type IssueWithRepo = Issue & { repoUrl: string };
type DispatchIssue = IssueWithRepo & {
  owner: string;
  name: string;
  language: string | null;
  ecosystems: string[];
  license: string | null;
};

@Injectable()
export class IssuesService {
  private readonly logger = new Logger(IssuesService.name);

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(RunnersService)
    private readonly runnersService: RunnersService,
    @Inject(ScoringService)
    private readonly scoringService: ScoringService,
    @Inject(RuntimeConfigService)
    private readonly runtimeConfigService: RuntimeConfigService,
    @Inject(DispatchMetricsService)
    private readonly dispatchMetricsService: DispatchMetricsService,
  ) {}

  /** Returns the highest-affinity pending issue available to a valid runner. */
  async getNextIssue(runnerToken: string): Promise<IssueDto | null> {
    const startedAt = Date.now();
    await this.runnersService.validateToken(runnerToken);
    await this.performQueueMaintenance();
    const runner = await this.runnersService.validateToken(runnerToken);
    if (!(await this.canRunnerReceiveWork(runner))) {
      return null;
    }

    const rows = await this.db
      .select({
        issue: issues,
        repoUrl: repos.githubUrl,
        owner: repos.owner,
        name: repos.name,
        language: repos.language,
        ecosystems: repos.ecosystems,
        license: repos.license,
      })
      .from(issues)
      .innerJoin(repos, eq(issues.repoId, repos.id))
      .where(eq(issues.status, "PENDING"))
      .orderBy(desc(issues.score), asc(issues.createdAt));

    const assessed = rows.map((row) => {
      const issue = { ...row.issue, ...row } as DispatchIssue;
      const match = this.scoringService.assessRunnerPreferences(
        issue,
        runner.preferences,
      );
      return { issue, match };
    });
    const rejectedSignals = assessed
      .filter((candidate) => !candidate.match.compatible)
      .map((candidate) => candidate.match.diagnostic.signals[0]?.name)
      .filter(Boolean);
    const matching = assessed
      .map((candidate) =>
        candidate.match.compatible
          ? {
              issue: candidate.issue,
              affinity: candidate.match.affinity,
              diagnostic: candidate.match.diagnostic,
            }
          : null,
      )
      .filter(
        (
          candidate,
        ): candidate is {
          issue: DispatchIssue;
          affinity: number;
          diagnostic: ScoringDiagnostic;
        } => candidate !== null,
      )
      .sort(
        (left, right) =>
          right.affinity - left.affinity ||
          right.issue.score - left.issue.score ||
          left.issue.createdAt.getTime() - right.issue.createdAt.getTime(),
      );

    const latencyMs = Date.now() - startedAt;
    this.dispatchMetricsService.recordMatchingLatency(latencyMs);
    this.logger.log(
      `Dispatch matching runnerId=${runner.id} pendingCandidates=${rows.length} compatibleCandidates=${matching.length} rejectedSignals=${this.summarizeSignals(rejectedSignals)} latencyMs=${latencyMs} selectedIssueId=${matching[0]?.issue.id ?? "none"} selectedAffinity=${matching[0]?.affinity ?? "none"} selectedAffinitySignals=${matching[0]?.diagnostic.signals.map((signal) => `${signal.name}:${signal.points}`).join(",") ?? ""}`,
    );

    return matching[0] ? this.toDto(matching[0].issue) : null;
  }

  /** Compacts repeated rejection reasons so dispatch logs stay bounded. */
  private summarizeSignals(signals: string[]): string {
    const counts = new Map<string, number>();
    for (const signal of signals) {
      counts.set(signal, (counts.get(signal) ?? 0) + 1);
    }
    return [...counts.entries()]
      .map(([signal, count]) => `${signal}:${count}`)
      .join(",");
  }

  /** Atomically assigns a pending issue to the authenticated runner. */
  async claimIssue(id: string, runnerToken: string): Promise<IssueDto> {
    await this.runnersService.validateToken(runnerToken);
    await this.performQueueMaintenance();
    const runner = await this.runnersService.validateToken(runnerToken);
    await this.assertRunnerCanClaim(runner);
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
    const issueMaxRetries =
      await this.runtimeConfigService.get("issueMaxRetries");
    const nextStatus =
      !request.success && retryCount < issueMaxRetries
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
          claimedBy: nextStatus === "PENDING" ? null : issue.claimedBy,
          claimedAt: nextStatus === "PENDING" ? null : issue.claimedAt,
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
        details: request.details ?? {},
      });
    });
  }

  /** Performs bounded queue cleanup before dispatch decisions read queue state. */
  private async performQueueMaintenance(): Promise<void> {
    const [
      issueClaimTimeoutMs,
      runnerHeartbeatTimeoutMs,
      queueMaintenanceBatchSize,
    ] = await Promise.all([
      this.runtimeConfigService.get("issueClaimTimeoutMs"),
      this.runtimeConfigService.get("runnerHeartbeatTimeoutMs"),
      this.runtimeConfigService.get("queueMaintenanceBatchSize"),
    ]);
    const now = new Date();

    await this.reclaimTimedOutClaims(
      new Date(now.getTime() - issueClaimTimeoutMs),
      queueMaintenanceBatchSize,
      now,
    );
    await this.runnersService.expireInactiveRunners(
      new Date(now.getTime() - runnerHeartbeatTimeoutMs),
    );
  }

  /** Converts timed-out claims into failed attempts without letting one poll drain the whole backlog. */
  private async reclaimTimedOutClaims(
    cutoff: Date,
    batchSize: number,
    now: Date,
  ): Promise<void> {
    const timedOutClaims = await this.db
      .select()
      .from(issues)
      .where(and(eq(issues.status, "CLAIMED"), lt(issues.claimedAt, cutoff)))
      .limit(batchSize);
    if (timedOutClaims.length === 0) return;

    const issueMaxRetries =
      await this.runtimeConfigService.get("issueMaxRetries");

    await this.db.transaction(async (tx) => {
      for (const issue of timedOutClaims) {
        const retryCount = issue.retryCount + 1;
        const nextStatus = retryCount < issueMaxRetries ? "PENDING" : "FAILED";

        await tx
          .update(issues)
          .set({
            status: nextStatus,
            retryCount,
            claimedBy: nextStatus === "PENDING" ? null : issue.claimedBy,
            claimedAt: nextStatus === "PENDING" ? null : issue.claimedAt,
            updatedAt: now,
          })
          .where(eq(issues.id, issue.id));

        if (issue.claimedBy) {
          await tx.insert(contributions).values({
            id: randomUUID(),
            issueId: issue.id,
            runnerId: issue.claimedBy,
            prUrl: null,
            status: "FAILED",
            tokensUsed: null,
            errorMessage: "Claim timed out",
            details: { reason: "claim_timeout" },
            createdAt: now,
          });
        }
      }
    });
  }

  /** Applies runner capacity invariants before the hub offers or claims work. */
  private async canRunnerReceiveWork(runner: Runner): Promise<boolean> {
    if (!runner.active || runner.quotaRemainingToday <= 0) return false;
    return !(await this.runnerHasActiveClaim(runner.id));
  }

  /** Raises claim-specific conflicts while GET /issues/next can stay a quiet 204. */
  private async assertRunnerCanClaim(runner: Runner): Promise<void> {
    if (!runner.active) throw new ConflictException("Runner is inactive");
    if (runner.quotaRemainingToday <= 0)
      throw new ConflictException("Runner quota exhausted");
    if (await this.runnerHasActiveClaim(runner.id)) {
      throw new ConflictException("Runner already has a claimed issue");
    }
  }

  /** Detects the current one-active-claim-per-runner policy from persisted queue state. */
  private async runnerHasActiveClaim(runnerId: string): Promise<boolean> {
    const [activeClaim] = await this.db
      .select({ id: issues.id })
      .from(issues)
      .where(and(eq(issues.status, "CLAIMED"), eq(issues.claimedBy, runnerId)))
      .limit(1);
    return activeClaim !== undefined;
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
      difficulty: issue.difficulty,
      estimatedMinutes: issue.estimatedMinutes,
      status: issue.status,
      claimedBy: issue.claimedBy,
      claimedAt: issue.claimedAt?.toISOString() ?? null,
      retryCount: issue.retryCount,
      createdAt: issue.createdAt.toISOString(),
      updatedAt: issue.updatedAt.toISOString(),
    };
  }
}
