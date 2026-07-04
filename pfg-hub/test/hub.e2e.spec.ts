import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import { AdminTokenGuard } from "../src/auth/admin-token.guard";
import { GlobalExceptionFilter } from "../src/errors/global-exception.filter";
import { GitHubService } from "../src/github/github.service";
import { HealthController } from "../src/health/health.controller";
import { IssuesController } from "../src/issues/issues.controller";
import { IssuesService } from "../src/issues/issues.service";
import { RunnersController } from "../src/runners/runners.controller";
import { RunnersService } from "../src/runners/runners.service";
import { SeedController } from "../src/seed/seed.controller";
import { StatsController } from "../src/stats/stats.controller";
import { StatsService } from "../src/stats/stats.service";
import { components } from "../src/types/openapi";

type IssueDto = components["schemas"]["IssueDto"];
type StatsResponse = components["schemas"]["StatsResponse"];

const issueDto: IssueDto = {
  id: "issue-1",
  githubId: 42,
  title: "Fix it",
  body: "Expected actual reproduce",
  githubUrl: "https://github.com/owner/repo/issues/42",
  repoUrl: "https://github.com/owner/repo",
  labels: "bug,good first issue",
  score: 85,
  status: "PENDING",
  claimedBy: null,
  claimedAt: null,
  retryCount: 0,
  createdAt: "2026-01-01T00:00:00.000Z",
  updatedAt: "2026-01-02T00:00:00.000Z",
};

const statsResponse: StatsResponse = {
  totalRepos: 3,
  eligibleRepos: 2,
  totalIssues: 5,
  pendingIssues: 1,
  claimedIssues: 1,
  doneIssues: 2,
  failedIssues: 1,
  totalPrsOpened: 2,
  activeRunners: 4,
};

type RunnersServiceMock = {
  register: ReturnType<typeof vi.fn>;
  heartbeat: ReturnType<typeof vi.fn>;
};

type IssuesServiceMock = {
  getNextIssue: ReturnType<typeof vi.fn>;
  claimIssue: ReturnType<typeof vi.fn>;
  reportDone: ReturnType<typeof vi.fn>;
};

type StatsServiceMock = {
  getStats: ReturnType<typeof vi.fn>;
};

type GitHubServiceMock = {
  seedRepo: ReturnType<typeof vi.fn>;
};

describe("hub e2e", () => {
  let app: INestApplication;
  let runnersService: RunnersServiceMock;
  let issuesService: IssuesServiceMock;
  let statsService: StatsServiceMock;
  let githubService: GitHubServiceMock;
  const originalAdminKey = process.env.ADMIN_KEY;

  beforeAll(async () => {
    process.env.ADMIN_KEY = "test-admin-key";

    runnersService = {
      register: vi.fn(),
      heartbeat: vi.fn(),
    };
    issuesService = {
      getNextIssue: vi.fn(),
      claimIssue: vi.fn(),
      reportDone: vi.fn(),
    };
    statsService = {
      getStats: vi.fn(),
    };
    githubService = {
      seedRepo: vi.fn(),
    };

    const moduleRef = await Test.createTestingModule({
      controllers: [
        HealthController,
        IssuesController,
        RunnersController,
        SeedController,
        StatsController,
      ],
      providers: [
        AdminTokenGuard,
        { provide: RunnersService, useValue: runnersService },
        { provide: IssuesService, useValue: issuesService },
        { provide: StatsService, useValue: statsService },
        { provide: GitHubService, useValue: githubService },
      ],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
  });

  beforeEach(() => {
    vi.clearAllMocks();
    runnersService.register.mockResolvedValue({
      id: "runner-1",
      token: "token-1",
    });
    runnersService.heartbeat.mockResolvedValue(undefined);
    issuesService.getNextIssue.mockResolvedValue(issueDto);
    issuesService.claimIssue.mockResolvedValue({
      ...issueDto,
      status: "CLAIMED",
      claimedBy: "runner-1",
      claimedAt: "2026-01-03T00:00:00.000Z",
    });
    issuesService.reportDone.mockResolvedValue(undefined);
    statsService.getStats.mockResolvedValue(statsResponse);
    githubService.seedRepo.mockResolvedValue(undefined);
  });

  afterAll(async () => {
    if (originalAdminKey === undefined) {
      delete process.env.ADMIN_KEY;
    } else {
      process.env.ADMIN_KEY = originalAdminKey;
    }
    await app?.close();
  });

  // The health endpoint is the smallest full-stack smoke test: Nest routing,
  // Fastify serialization, and the controller response all have to work.
  it("serves the health endpoint", async () => {
    const response = await request(app.getHttpServer())
      .get("/actuator/health")
      .expect(200);

    expect(response.body).toEqual({ status: "UP" });
  });

  // Runner registration accepts the public request body and exposes only the
  // credentials the agent needs, not the full internal runner record.
  it("registers a runner through the HTTP API", async () => {
    const response = await request(app.getHttpServer())
      .post("/runners/register")
      .send({ contributorName: "octocat" })
      .expect(200);

    expect(runnersService.register).toHaveBeenCalledWith("octocat");
    expect(response.body).toEqual({ runnerId: "runner-1", token: "token-1" });
  });

  // Heartbeats must read the runner id from the URL, the token from the header,
  // and the quota from the body before returning an empty 204 response.
  it("records runner heartbeats through the HTTP API", async () => {
    await request(app.getHttpServer())
      .post("/runners/runner-1/heartbeat")
      .set("X-Runner-Token", "token-1")
      .send({ quotaRemainingToday: 250 })
      .expect(204);

    expect(runnersService.heartbeat).toHaveBeenCalledWith(
      "runner-1",
      "token-1",
      250,
    );
  });

  // Fetching the next issue forwards the runner token and returns the service
  // DTO unchanged when work is available.
  it("returns the next available issue through the HTTP API", async () => {
    const response = await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", "token-1")
      .expect(200);

    expect(issuesService.getNextIssue).toHaveBeenCalledWith("token-1");
    expect(response.body).toEqual(issueDto);
  });

  // When the service says the queue is empty, the controller must translate
  // that null into a 204 with no response body.
  it("returns 204 when no issue is available", async () => {
    issuesService.getNextIssue.mockResolvedValueOnce(null);

    const response = await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", "token-1")
      .expect(204);

    expect(response.text).toBe("");
  });

  // Claiming an issue uses both path and header parameters and returns the
  // claimed issue DTO to the runner.
  it("claims an issue through the HTTP API", async () => {
    const response = await request(app.getHttpServer())
      .post("/issues/issue-1/claim")
      .set("X-Runner-Token", "token-1")
      .expect(200);

    expect(issuesService.claimIssue).toHaveBeenCalledWith("issue-1", "token-1");
    expect(response.body).toMatchObject({
      id: "issue-1",
      status: "CLAIMED",
      claimedBy: "runner-1",
    });
  });

  // Reporting completion must pass the request body through to the service and
  // respond with 204 so agents know there is no payload to parse.
  it("reports issue completion through the HTTP API", async () => {
    const requestBody = {
      success: true,
      prUrl: "https://github.com/owner/repo/pull/7",
      tokensUsed: 123,
    };

    await request(app.getHttpServer())
      .post("/issues/issue-1/done")
      .set("X-Runner-Token", "token-1")
      .send(requestBody)
      .expect(204);

    expect(issuesService.reportDone).toHaveBeenCalledWith(
      "issue-1",
      "token-1",
      requestBody,
    );
  });

  // The stats endpoint exposes the aggregate hub counters as a direct JSON
  // response for dashboards and monitoring.
  it("serves hub stats through the HTTP API", async () => {
    const response = await request(app.getHttpServer())
      .get("/stats")
      .expect(200);

    expect(statsService.getStats).toHaveBeenCalledOnce();
    expect(response.body).toEqual(statsResponse);
  });

  // Seed endpoints are protected at the HTTP layer, so missing admin headers
  // should be rejected before the GitHub service is called.
  it("rejects seed requests without the admin token", async () => {
    const response = await request(app.getHttpServer())
      .post("/seed/default")
      .expect(401);

    expect(response.body).toEqual({
      error: "Invalid or missing X-Admin-Token",
    });
    expect(githubService.seedRepo).not.toHaveBeenCalled();
  });

  // Authorized seed requests forward the owner/name query parameters to the
  // GitHub seeding service.
  it("seeds a requested repository with the admin token", async () => {
    await request(app.getHttpServer())
      .post("/seed/repo")
      .set("X-Admin-Token", "test-admin-key")
      .query({ owner: "nodejs", name: "node" })
      .expect(200);

    expect(githubService.seedRepo).toHaveBeenCalledWith("nodejs", "node");
  });
});
