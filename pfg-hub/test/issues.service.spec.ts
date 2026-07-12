import {
  ConflictException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Database } from "../src/db/database.module";
import { Issue, Runner } from "../src/db/schema";
import { IssuesService } from "../src/issues/issues.service";
import { RuntimeConfigService } from "../src/runtime-config/runtime-config.service";
import { RunnersService } from "../src/runners/runners.service";
import { ScoringService } from "../src/scoring/scoring.service";

const runner: Runner = {
  id: "runner-1",
  token: "token-1",
  contributorName: "octocat",
  quotaRemainingToday: 500,
  lastSeenAt: new Date("2026-01-01T00:00:00Z"),
  active: true,
  preferences: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

const issue: Issue = {
  id: "issue-1",
  repoId: "repo-1",
  githubId: 42,
  title: "Fix it",
  body: "Expected actual reproduce",
  githubUrl: "https://github.com/owner/repo/issues/42",
  labels: "bug,good first issue",
  score: 85,
  scoreDiagnostic: { score: 85, signals: [] },
  difficulty: "medium",
  estimatedMinutes: 90,
  status: "PENDING",
  claimedBy: null,
  claimedAt: null,
  retryCount: 0,
  createdAt: new Date("2026-01-01T00:00:00Z"),
  updatedAt: new Date("2026-01-02T00:00:00Z"),
};

type SelectRow = unknown[];

function createSelectChain(results: SelectRow[]) {
  const limit = vi.fn(async () => results.shift() ?? []);
  const orderBy = vi.fn(
    async (_first: unknown, _second: unknown) => results.shift() ?? [],
  );
  const where = vi.fn((_condition: unknown) => ({ limit, orderBy }));
  const innerJoin = vi.fn((_table: unknown, _condition: unknown) => ({
    where,
  }));
  const from = vi.fn((_table: unknown) => ({ innerJoin, where }));
  const select = vi.fn((_selection?: unknown) => ({ from }));

  return { select, from, innerJoin, where, orderBy, limit };
}

function createUpdateChain(returningRows: Issue[] = []) {
  const returning = vi.fn(async () => returningRows);
  const where = vi.fn((_condition: unknown) => ({ returning }));
  const set = vi.fn((_value: Record<string, unknown>) => ({ where }));
  const update = vi.fn((_table: unknown) => ({ set }));

  return { update, set, where, returning };
}

function createInsertChain() {
  const values = vi.fn(async (_value: Record<string, unknown>) => undefined);
  const insert = vi.fn((_table: unknown) => ({ values }));

  return { insert, values };
}

function createIssuesService(options: {
  selectResults?: SelectRow[];
  updateRows?: Issue[];
  runner?: Runner;
  issueMaxRetries?: number;
}) {
  const select = createSelectChain(options.selectResults ?? []);
  const update = createUpdateChain(options.updateRows ?? []);
  const txUpdate = createUpdateChain();
  const txInsert = createInsertChain();
  const tx = { update: txUpdate.update, insert: txInsert.insert };
  const transaction = vi.fn(
    async (callback: (transactionDb: typeof tx) => Promise<void>) =>
      callback(tx),
  );
  const db = {
    select: select.select,
    update: update.update,
    transaction,
  } as unknown as Database;
  const runnersService = {
    validateToken: vi.fn(async (_token: string) => options.runner ?? runner),
    expireInactiveRunners: vi.fn(async (_cutoff: Date) => undefined),
  } as unknown as RunnersService;
  const scoringService = {
    assessRunnerPreferences: vi.fn(() => ({
      compatible: true,
      affinity: 0,
      diagnostic: { score: 0, signals: [] },
    })),
    matchRunnerPreferences: vi.fn(() => 0),
  } as unknown as ScoringService;
  const runtimeConfigService = {
    get: vi.fn(async (key: string) => {
      if (key === "issueClaimTimeoutMs") return 2 * 60 * 60 * 1000;
      if (key === "runnerHeartbeatTimeoutMs") return 30 * 60 * 1000;
      if (key === "queueMaintenanceBatchSize") return 100;
      return options.issueMaxRetries ?? 3;
    }),
  } as unknown as RuntimeConfigService;
  const dispatchMetricsService = {
    recordMatchingLatency: vi.fn(),
  };

  return {
    service: new IssuesService(
      db,
      runnersService,
      scoringService,
      runtimeConfigService,
      dispatchMetricsService,
    ),
    select,
    update,
    txUpdate,
    txInsert,
    transaction,
    runnersService,
    scoringService,
    runtimeConfigService,
    dispatchMetricsService,
  };
}

function withRepo(rowIssue: Issue) {
  return {
    issue: rowIssue,
    repoUrl: "https://github.com/owner/repo",
    owner: "owner",
    name: "repo",
    language: "TypeScript",
    ecosystems: ["npm"],
    license: "MIT",
  };
}

describe("IssuesService", () => {
  // Fetching the next issue first authenticates the runner, then maps the
  // database row plus repository URL into the public IssueDto shape.
  it("validates the runner token and returns the highest-priority pending issue", async () => {
    const { service, runnersService } = createIssuesService({
      selectResults: [[], [], [withRepo(issue)]],
    });

    const dto = await service.getNextIssue("token-1");

    expect(runnersService.validateToken).toHaveBeenCalledWith("token-1");
    expect(dto).toMatchObject({
      id: "issue-1",
      repoUrl: "https://github.com/owner/repo",
      labels: "bug,good first issue",
      status: "PENDING",
      createdAt: "2026-01-01T00:00:00.000Z",
      updatedAt: "2026-01-02T00:00:00.000Z",
    });
  });

  // An empty queue is represented as null at the service layer; the controller
  // turns that into the HTTP 204 response.
  it("returns null when no pending issue is available", async () => {
    const { service } = createIssuesService({ selectResults: [[], [], []] });

    await expect(service.getNextIssue("token-1")).resolves.toBeNull();
  });

  it("returns null when runner quota or liveness prevents dispatch", async () => {
    const noQuota = createIssuesService({
      runner: { ...runner, quotaRemainingToday: 0 },
      selectResults: [[], []],
    }).service;
    await expect(noQuota.getNextIssue("token-1")).resolves.toBeNull();

    const inactive = createIssuesService({
      runner: { ...runner, active: false },
      selectResults: [[], []],
    }).service;
    await expect(inactive.getNextIssue("token-1")).resolves.toBeNull();
  });

  it("returns null when the runner already has a claimed issue", async () => {
    const { service } = createIssuesService({
      selectResults: [[], [{ id: "active-claim" }]],
    });

    await expect(service.getNextIssue("token-1")).resolves.toBeNull();
  });

  it("records timed-out claims as failed attempts before dispatch", async () => {
    const staleClaim: Issue = {
      ...issue,
      status: "CLAIMED",
      claimedBy: runner.id,
      claimedAt: new Date("2026-01-01T00:00:00Z"),
      retryCount: 1,
    };
    const { service, txUpdate, txInsert } = createIssuesService({
      selectResults: [[staleClaim], [], []],
    });

    await expect(service.getNextIssue("token-1")).resolves.toBeNull();

    expect(txUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PENDING",
        retryCount: 2,
        claimedBy: null,
        claimedAt: null,
        updatedAt: expect.any(Date),
      }),
    );
    expect(txInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: "issue-1",
        runnerId: "runner-1",
        status: "FAILED",
        errorMessage: "Claim timed out",
        details: { reason: "claim_timeout" },
      }),
    );
  });

  it("prefers a compatible issue over a higher globally scored issue", async () => {
    const preferred: Issue = { ...issue, id: "preferred", score: 80 };
    const higherScored: Issue = { ...issue, id: "higher-scored", score: 95 };
    const { service, scoringService } = createIssuesService({
      selectResults: [
        [],
        [],
        [
          {
            ...withRepo(preferred),
            owner: "acme",
            name: "preferred-project",
            language: "TypeScript",
            ecosystems: ["npm"],
            license: "MIT",
          },
          {
            ...withRepo(higherScored),
            owner: "acme",
            name: "higher-scored-project",
            language: "Python",
            ecosystems: ["pip"],
            license: "MIT",
          },
        ],
      ],
    });
    vi.mocked(scoringService.assessRunnerPreferences).mockImplementation(
      (candidate) => ({
        compatible: true,
        affinity: candidate.name === "preferred-project" ? 4 : 0,
        diagnostic: {
          score: candidate.name === "preferred-project" ? 4 : 0,
          signals: [],
        },
      }),
    );

    await expect(service.getNextIssue("token-1")).resolves.toMatchObject({
      id: "preferred",
    });
  });

  // Claiming an issue is a conditional state transition: only a pending issue
  // can become claimed, and the claiming runner id/timestamp are persisted.
  it("claims only pending issues for the runner", async () => {
    const claimedAt = new Date("2026-01-03T00:00:00Z");
    const claimedIssue: Issue = {
      ...issue,
      status: "CLAIMED",
      claimedBy: runner.id,
      claimedAt,
      updatedAt: claimedAt,
    };
    const { service, update } = createIssuesService({
      updateRows: [claimedIssue],
      selectResults: [[], [], [withRepo(claimedIssue)]],
    });

    const dto = await service.claimIssue("issue-1", "token-1");

    expect(update.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "CLAIMED",
        claimedBy: "runner-1",
        claimedAt: expect.any(Date),
        updatedAt: expect.any(Date),
      }),
    );
    expect(dto.status).toBe("CLAIMED");
    expect(dto.claimedBy).toBe("runner-1");
    expect(dto.claimedAt).toBe("2026-01-03T00:00:00.000Z");
  });

  // When the conditional claim update affects no rows, the service does a
  // follow-up lookup to return the correct domain error to callers.
  it("distinguishes missing issues from already claimed issues", async () => {
    const missing = createIssuesService({
      updateRows: [],
      selectResults: [[], [], []],
    }).service;
    await expect(
      missing.claimIssue("missing", "token-1"),
    ).rejects.toBeInstanceOf(NotFoundException);

    const alreadyClaimed = createIssuesService({
      updateRows: [],
      selectResults: [[], [], [{ ...issue, status: "CLAIMED" }]],
    }).service;
    await expect(
      alreadyClaimed.claimIssue("issue-1", "token-1"),
    ).rejects.toBeInstanceOf(ConflictException);
  });

  // A successful completion marks the issue as DONE, keeps the retry counter as
  // is, and records the PR contribution for the claiming runner.
  it("records a successful report as done without incrementing retries", async () => {
    const claimedIssue: Issue = {
      ...issue,
      status: "CLAIMED",
      claimedBy: runner.id,
      retryCount: 2,
    };
    const { service, txUpdate, txInsert } = createIssuesService({
      selectResults: [[claimedIssue]],
    });

    await service.reportDone("issue-1", "token-1", {
      success: true,
      prUrl: "https://github.com/owner/repo/pull/7",
      tokensUsed: 123,
      details: {
        verification: { status: "skipped", missingBuildSystem: true },
      },
    });

    expect(txUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "DONE",
        retryCount: 2,
        updatedAt: expect.any(Date),
      }),
    );
    expect(txInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        issueId: "issue-1",
        runnerId: "runner-1",
        prUrl: "https://github.com/owner/repo/pull/7",
        status: "SUCCESS",
        tokensUsed: 123,
        errorMessage: null,
        details: {
          verification: { status: "skipped", missingBuildSystem: true },
        },
      }),
    );
  });

  // A failed completion below the retry limit returns the issue to the pending
  // queue while still recording a failed contribution attempt.
  it("requeues failed reports until the retry limit is reached", async () => {
    const claimedIssue: Issue = {
      ...issue,
      status: "CLAIMED",
      claimedBy: runner.id,
      retryCount: 1,
    };
    const { service, txUpdate, txInsert } = createIssuesService({
      selectResults: [[claimedIssue]],
    });

    await service.reportDone("issue-1", "token-1", {
      success: false,
      errorMessage: "tests failed",
    });

    expect(txUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "PENDING",
        retryCount: 2,
      }),
    );
    expect(txInsert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED",
        prUrl: null,
        tokensUsed: null,
        errorMessage: "tests failed",
        details: {},
      }),
    );
  });

  // Once a failure reaches the configured retry limit, the issue leaves the
  // queue permanently as FAILED.
  it("marks failed reports as failed at the retry limit", async () => {
    const claimedIssue: Issue = {
      ...issue,
      status: "CLAIMED",
      claimedBy: runner.id,
      retryCount: 2,
    };
    const { service, txUpdate } = createIssuesService({
      selectResults: [[claimedIssue]],
    });

    await service.reportDone("issue-1", "token-1", { success: false });

    expect(txUpdate.set).toHaveBeenCalledWith(
      expect.objectContaining({
        status: "FAILED",
        retryCount: 3,
      }),
    );
  });

  // Reports are accepted only for existing issues claimed by the same runner;
  // this prevents one runner from completing or failing another runner's work.
  it("requires reports to target an issue claimed by the runner", async () => {
    const missing = createIssuesService({ selectResults: [[]] }).service;
    await expect(
      missing.reportDone("missing", "token-1", { success: true }),
    ).rejects.toBeInstanceOf(NotFoundException);

    const claimedByAnotherRunner: Issue = {
      ...issue,
      status: "CLAIMED",
      claimedBy: "runner-2",
    };
    const unauthorized = createIssuesService({
      selectResults: [[claimedByAnotherRunner]],
    }).service;
    await expect(
      unauthorized.reportDone("issue-1", "token-1", { success: true }),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });
});
