import "reflect-metadata";
import { INestApplication } from "@nestjs/common";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { Test } from "@nestjs/testing";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import request from "supertest";
import {
  afterAll,
  afterEach,
  beforeAll,
  beforeEach,
  describe,
  expect,
  it,
  vi,
} from "vitest";
import { AppModule } from "../src/app.module";
import { DATABASE, Database, PG_POOL } from "../src/db/database.module";
import {
  contributions,
  ingestionRuns,
  issues,
  repos,
  runners,
  runtimeConfigOverrides,
} from "../src/db/schema";
import type { IssueStatus } from "../src/db/schema";
import { GlobalExceptionFilter } from "../src/errors/global-exception.filter";
import { configureOpenApi } from "../src/openapi/swagger";

const runDbTests = process.env.RUN_DB_TESTS === "true";
const describeDb = runDbTests ? describe : describe.skip;

type RegisterResponse = {
  runnerId: string;
  token: string;
};

type SeedIssueInput = {
  id: string;
  githubId: number;
  title?: string;
  body?: string;
  labels?: string;
  score?: number;
  status?: IssueStatus;
  claimedBy?: string | null;
  claimedAt?: Date | null;
  retryCount?: number;
  createdAt?: Date;
  updatedAt?: Date;
};

const adminToken = "test-admin-key";

describeDb("hub e2e", () => {
  let app: INestApplication;
  let db: Database;
  let pool: Pool;
  const originalAdminKey = process.env.ADMIN_KEY;
  const originalIssueMaxRetries = process.env.ISSUE_MAX_RETRIES;
  const originalIssueMinScore = process.env.ISSUE_MIN_SCORE;
  const originalGithubToken = process.env.GITHUB_TOKEN;
  const originalGithubIngestionEnabled = process.env.GITHUB_INGESTION_ENABLED;

  beforeAll(async () => {
    process.env.ADMIN_KEY = adminToken;
    process.env.ISSUE_MAX_RETRIES = "3";
    process.env.ISSUE_MIN_SCORE = "60";
    process.env.GITHUB_TOKEN = "test-github-token";
    delete process.env.GITHUB_INGESTION_ENABLED;

    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    app.useGlobalFilters(new GlobalExceptionFilter());
    app.enableCors({
      origin: ["http://localhost:5173", "http://127.0.0.1:5173"],
      credentials: true,
      allowedHeaders: ["Content-Type", "X-Admin-Token"],
    });
    configureOpenApi(app);
    await app.init();
    await app.getHttpAdapter().getInstance().ready();

    db = app.get<Database>(DATABASE);
    pool = app.get<Pool>(PG_POOL);
  });

  beforeEach(async () => {
    await truncateDb();
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  afterAll(async () => {
    restoreEnv("ADMIN_KEY", originalAdminKey);
    restoreEnv("ISSUE_MAX_RETRIES", originalIssueMaxRetries);
    restoreEnv("ISSUE_MIN_SCORE", originalIssueMinScore);
    restoreEnv("GITHUB_TOKEN", originalGithubToken);
    restoreEnv("GITHUB_INGESTION_ENABLED", originalGithubIngestionEnabled);
    await app?.close();
  });

  it("serves the health endpoint", async () => {
    const response = await request(app.getHttpServer())
      .get("/actuator/health")
      .expect(200);

    expect(response.body).toEqual({ status: "UP" });
  });

  it("serves generated OpenAPI with runner and admin security schemes", async () => {
    const response = await request(app.getHttpServer())
      .get("/docs-json")
      .expect(200);

    expect(response.body.info.title).toBe("PFG Hub API");
    expect(response.body.paths["/actuator/health"]).toBeDefined();
    expect(response.body.paths["/runners/register"]).toBeDefined();
    expect(response.body.paths["/runners/{id}/heartbeat"]).toBeDefined();
    expect(response.body.paths["/issues/next"]).toBeDefined();
    expect(response.body.paths["/issues/{id}/claim"]).toBeDefined();
    expect(response.body.paths["/issues/{id}/done"]).toBeDefined();
    expect(response.body.paths["/stats"]).toBeDefined();
    expect(response.body.paths["/repos"]).toBeDefined();
    expect(response.body.paths["/token-usage"]).toBeDefined();
    expect(response.body.paths["/admin/session"]).toBeDefined();
    expect(response.body.paths["/admin/repositories"]).toBeDefined();
    expect(response.body.paths["/admin/issues"]).toBeDefined();
    expect(response.body.paths["/admin/runners"]).toBeDefined();
    expect(response.body.paths["/admin/contributions"]).toBeDefined();
    expect(response.body.paths["/admin/configuration"]).toBeDefined();
    expect(response.body.paths["/admin/configuration/{key}"]).toBeDefined();
    expect(response.body.paths["/seed/default"]).toBeDefined();
    expect(response.body.paths["/seed/repo"]).toBeDefined();
    expect(response.body.paths["/seed/discover"]).toBeDefined();
    expect(response.body.paths["/seed/ingestion-runs"]).toBeDefined();
    expect(response.body.components.securitySchemes.RunnerToken.name).toBe(
      "X-Runner-Token",
    );
    expect(response.body.components.securitySchemes.AdminToken.name).toBe(
      "X-Admin-Token",
    );
    expect(
      response.body.components.schemas.RuntimeConfigItemDto.properties.value
        .oneOf,
    ).toEqual([
      { type: "boolean" },
      { type: "integer" },
      { type: "string" },
      { type: "null" },
    ]);
    expect(
      response.body.components.schemas.RuntimeConfigItemDto.properties
        .environmentValue,
    ).toMatchObject({ nullable: true, type: "string" });
    expect(
      response.body.components.schemas.RuntimeConfigMetadataDto.properties
        .defaultValue.oneOf,
    ).toEqual([
      { type: "boolean" },
      { type: "integer" },
      { type: "string" },
      { type: "null" },
    ]);
    expect(response.body.paths["/issues/next"].get.security).toEqual([
      { RunnerToken: [] },
    ]);
    expect(
      response.body.paths["/runners/{id}/heartbeat"].post.security,
    ).toEqual([{ RunnerToken: [] }]);
    expect(response.body.paths["/issues/{id}/claim"].post.security).toEqual([
      { RunnerToken: [] },
    ]);
    expect(response.body.paths["/issues/{id}/done"].post.security).toEqual([
      { RunnerToken: [] },
    ]);
    expect(response.body.paths["/seed/default"].post.security).toEqual([
      { AdminToken: [] },
    ]);
    expect(response.body.paths["/seed/repo"].post.security).toEqual([
      { AdminToken: [] },
    ]);
    expect(response.body.paths["/seed/discover"].post.security).toEqual([
      { AdminToken: [] },
    ]);
    expect(
      response.body.paths["/seed/discover"].post.responses["202"],
    ).toBeDefined();
    expect(response.body.paths["/seed/ingestion-runs"].get.security).toEqual([
      { AdminToken: [] },
    ]);
    expect(response.body.paths["/repos"].get.security).toBeUndefined();
    expect(response.body.paths["/token-usage"].get.security).toBeUndefined();
  });

  it("serves public repositories with filters and aggregate token usage", async () => {
    const runner = await registerRunner("public-runner");
    await seedRepo({
      id: "repo-low",
      githubUrl: "https://github.com/acme/legacy",
      owner: "acme",
      name: "legacy",
      language: "JavaScript",
      score: 20,
      stars: 10,
      eligible: false,
    });
    await seedRepo({
      id: "repo-1",
      githubUrl: "https://github.com/acme/project",
      owner: "acme",
      name: "project",
      language: "TypeScript",
      ecosystems: ["node"],
      license: "MIT",
      ciDetected: true,
      testsDetected: true,
      score: 95,
      stars: 100,
      eligible: true,
    });
    await seedIssue({ id: "done", githubId: 42, status: "DONE" });
    await seedIssue({ id: "failed", githubId: 43, status: "FAILED" });
    await db.insert(contributions).values([
      {
        id: "contribution-1",
        issueId: "done",
        runnerId: runner.runnerId,
        prUrl: "https://github.com/acme/project/pull/1",
        status: "SUCCESS",
        tokensUsed: 250,
      },
      {
        id: "contribution-2",
        issueId: "failed",
        runnerId: runner.runnerId,
        status: "FAILED",
        tokensUsed: 50,
      },
    ]);

    const repositoriesResponse = await request(app.getHttpServer())
      .get("/repos")
      .query({ limit: 1, offset: 0, q: "acme", eligible: true })
      .expect(200);

    expect(repositoriesResponse.body).toMatchObject({
      total: 1,
      data: [
        {
          id: "repo-1",
          githubUrl: "https://github.com/acme/project",
          owner: "acme",
          name: "project",
          language: "TypeScript",
          ecosystems: ["node"],
          license: "MIT",
          ciDetected: true,
          testsDetected: true,
          score: 95,
          stars: 100,
          eligible: true,
        },
      ],
    });
    expect(repositoriesResponse.body.data[0]).not.toHaveProperty(
      "scoreDiagnostic",
    );

    const tokenUsageResponse = await request(app.getHttpServer())
      .get("/token-usage")
      .expect(200);

    expect(tokenUsageResponse.body).toEqual({
      totalTokensUsed: 300,
      successfulContributions: 1,
      failedContributions: 1,
    });
  });

  it("serves authenticated React-admin lists with filters and safe runner fields", async () => {
    const runner = await registerRunner("alice");
    await db
      .update(runners)
      .set({
        quotaRemainingToday: 500,
        lastSeenAt: new Date("2026-02-02T10:00:00Z"),
      })
      .where(eq(runners.id, runner.runnerId));
    await seedRepo({
      id: "repo-low",
      githubUrl: "https://github.com/acme/legacy",
      owner: "acme",
      name: "legacy",
      stars: 10,
      eligible: false,
    });
    await seedRepo({
      id: "repo-1",
      githubUrl: "https://github.com/acme/project",
      owner: "acme",
      name: "project",
      stars: 100,
      eligible: true,
    });
    await seedIssue({ id: "issue-1", githubId: 42, title: "Fix admin data" });
    await db.insert(contributions).values({
      id: "contribution-1",
      issueId: "issue-1",
      runnerId: runner.runnerId,
      prUrl: "https://github.com/acme/project/pull/1",
      status: "SUCCESS",
      tokensUsed: 250,
    });

    await request(app.getHttpServer()).get("/admin/session").expect(401);

    const sessionResponse = await request(app.getHttpServer())
      .get("/admin/session")
      .set("X-Admin-Token", adminToken)
      .set("Origin", "http://localhost:5173")
      .expect("access-control-allow-origin", "http://localhost:5173")
      .expect(200);
    expect(sessionResponse.body).toEqual({ authenticated: true });

    const repositoriesResponse = await request(app.getHttpServer())
      .get("/admin/repositories")
      .set("X-Admin-Token", adminToken)
      .query({
        sort: JSON.stringify(["stars", "DESC"]),
        range: JSON.stringify([0, 0]),
        filter: JSON.stringify({ q: "acme" }),
      })
      .expect(200);
    expect(repositoriesResponse.body).toMatchObject({
      total: 2,
      data: [{ id: "repo-1", name: "project", stars: 100 }],
    });

    const issuesResponse = await request(app.getHttpServer())
      .get("/admin/issues")
      .set("X-Admin-Token", adminToken)
      .query({ filter: JSON.stringify({ status: "PENDING", q: "admin" }) })
      .expect(200);
    expect(issuesResponse.body).toMatchObject({
      total: 1,
      data: [{ id: "issue-1", githubUrl: expect.any(String) }],
    });

    const runnersResponse = await request(app.getHttpServer())
      .get("/admin/runners")
      .set("X-Admin-Token", adminToken)
      .query({ filter: JSON.stringify({ active: true }) })
      .expect(200);
    expect(runnersResponse.body).toMatchObject({
      total: 1,
      data: [{ id: runner.runnerId, contributorName: "alice" }],
    });
    expect(runnersResponse.body.data[0]).not.toHaveProperty("token");
    expect(runnersResponse.body.data[0]).not.toHaveProperty("preferences");

    const contributionsResponse = await request(app.getHttpServer())
      .get("/admin/contributions")
      .set("X-Admin-Token", adminToken)
      .query({ filter: JSON.stringify({ status: "SUCCESS" }) })
      .expect(200);
    expect(contributionsResponse.body).toMatchObject({
      total: 1,
      data: [{ id: "contribution-1", tokensUsed: 250 }],
    });
  });

  it("serves and mutates runtime configuration through protected admin endpoints", async () => {
    await request(app.getHttpServer()).get("/admin/configuration").expect(401);

    const listResponse = await request(app.getHttpServer())
      .get("/admin/configuration")
      .set("X-Admin-Token", adminToken)
      .expect(200);
    const configItems = listResponse.body.data as Array<{
      key: string;
      value: unknown;
      environmentValue: string | null;
      source: string;
      hasDatabaseOverride: boolean;
      metadata: { env: string; secret: boolean; category: string };
    }>;
    const keys = configItems.map((item) => item.key);

    expect(keys).toContain("issueMinScore");
    expect(keys).toContain("githubIngestionEnabled");
    expect(keys).toContain("databaseUrl");
    expect(keys).toContain("port");
    expect(keys).toContain("adminKey");
    expect(keys).toContain("githubToken");
    expect(
      configItems.find((item) => item.key === "issueMinScore"),
    ).toMatchObject({
      value: 60,
      environmentValue: "60",
      source: "environment",
      hasDatabaseOverride: false,
      metadata: {
        env: "ISSUE_MIN_SCORE",
        secret: false,
        category: "Issues",
      },
    });
    expect(
      configItems.find((item) => item.key === "githubIngestionEnabled"),
    ).toMatchObject({
      value: false,
      source: "default",
      hasDatabaseOverride: false,
    });
    expect(configItems.find((item) => item.key === "adminKey")).toMatchObject({
      value: null,
      environmentValue: null,
      source: "environment",
      hasDatabaseOverride: false,
      metadata: {
        env: "ADMIN_KEY",
        secret: true,
        category: "Security",
      },
    });

    await request(app.getHttpServer())
      .put("/admin/configuration/issueMinScore")
      .set("X-Admin-Token", adminToken)
      .send({ value: 150 })
      .expect(400);

    const updateResponse = await request(app.getHttpServer())
      .put("/admin/configuration/issueMinScore")
      .set("X-Admin-Token", adminToken)
      .set("X-Admin-User", "alice")
      .send({ value: 75 })
      .expect(200);
    expect(updateResponse.body).toMatchObject({
      key: "issueMinScore",
      value: 75,
      environmentValue: "60",
      source: "database",
      hasDatabaseOverride: true,
      updatedBy: "alice",
    });

    const secretUpdateResponse = await request(app.getHttpServer())
      .put("/admin/configuration/githubToken")
      .set("X-Admin-Token", adminToken)
      .set("X-Admin-User", "alice")
      .send({ value: "db-github-token" })
      .expect(200);
    expect(secretUpdateResponse.body).toMatchObject({
      key: "githubToken",
      value: null,
      environmentValue: null,
      source: "database",
      hasDatabaseOverride: true,
      updatedBy: "alice",
      metadata: {
        env: "GITHUB_TOKEN",
        secret: true,
        category: "GitHub API",
      },
    });

    const [override] = await db
      .select()
      .from(runtimeConfigOverrides)
      .where(eq(runtimeConfigOverrides.key, "issueMinScore"))
      .limit(1);
    expect(override).toMatchObject({
      key: "issueMinScore",
      value: 75,
      updatedBy: "alice",
    });

    const [secretOverride] = await db
      .select()
      .from(runtimeConfigOverrides)
      .where(eq(runtimeConfigOverrides.key, "githubToken"))
      .limit(1);
    expect(secretOverride).toMatchObject({
      key: "githubToken",
      value: "db-github-token",
      updatedBy: "alice",
    });

    const resetResponse = await request(app.getHttpServer())
      .delete("/admin/configuration/issueMinScore")
      .set("X-Admin-Token", adminToken)
      .expect(200);
    expect(resetResponse.body).toMatchObject({
      key: "issueMinScore",
      value: 60,
      environmentValue: "60",
      source: "environment",
      hasDatabaseOverride: false,
      updatedBy: null,
    });

    const remainingOverrides = await db
      .select()
      .from(runtimeConfigOverrides)
      .where(eq(runtimeConfigOverrides.key, "issueMinScore"));
    expect(remainingOverrides).toEqual([]);
  });

  it("registers a runner through the HTTP API and persists only trimmed public input", async () => {
    const response = await request(app.getHttpServer())
      .post("/runners/register")
      .send({ contributorName: "  octocat  " })
      .expect(200);

    expect(Object.keys(response.body).sort()).toEqual(["runnerId", "token"]);
    expect(response.body.runnerId).toEqual(expect.any(String));
    expect(response.body.token).toEqual(expect.any(String));

    const [runner] = await db
      .select()
      .from(runners)
      .where(eq(runners.id, response.body.runnerId))
      .limit(1);
    expect(runner).toMatchObject({
      id: response.body.runnerId,
      token: response.body.token,
      contributorName: "octocat",
      quotaRemainingToday: 0,
      active: true,
    });
    expect(runner.lastSeenAt).toBeInstanceOf(Date);
  });

  it("rejects missing or blank contributor names without creating a runner", async () => {
    await request(app.getHttpServer())
      .post("/runners/register")
      .send({})
      .expect(400);

    const blankResponse = await request(app.getHttpServer())
      .post("/runners/register")
      .send({ contributorName: "   " })
      .expect(400);

    expect(blankResponse.body).toEqual({
      error: "Missing or invalid contributor name",
    });
    expect(await countRows("runners")).toBe(0);
  });

  it("records runner heartbeats and persists quota, last seen and active state", async () => {
    const runner = await registerRunner();

    await db
      .update(runners)
      .set({ active: false, lastSeenAt: null })
      .where(eq(runners.id, runner.runnerId));

    await request(app.getHttpServer())
      .post(`/runners/${runner.runnerId}/heartbeat`)
      .set("X-Runner-Token", runner.token)
      .send({ quotaRemainingToday: 250 })
      .expect(204);

    const [updated] = await db
      .select()
      .from(runners)
      .where(eq(runners.id, runner.runnerId))
      .limit(1);
    expect(updated.quotaRemainingToday).toBe(250);
    expect(updated.lastSeenAt).toBeInstanceOf(Date);
    expect(updated.active).toBe(true);
  });

  it("rejects invalid heartbeat request bodies before updating quota", async () => {
    const runner = await registerRunner();

    await request(app.getHttpServer())
      .post(`/runners/${runner.runnerId}/heartbeat`)
      .set("X-Runner-Token", runner.token)
      .send({ quotaRemainingToday: -1 })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/runners/${runner.runnerId}/heartbeat`)
      .set("X-Runner-Token", runner.token)
      .send({ quotaRemainingToday: "250" })
      .expect(400);

    await request(app.getHttpServer())
      .post(`/runners/${runner.runnerId}/heartbeat`)
      .set("X-Runner-Token", runner.token)
      .send({ quotaRemainingToday: 250, extra: true })
      .expect(400);

    const [unchanged] = await db
      .select()
      .from(runners)
      .where(eq(runners.id, runner.runnerId))
      .limit(1);
    expect(unchanged.quotaRemainingToday).toBe(500);
  });

  it("rejects runner heartbeats with missing, invalid or unknown runner credentials", async () => {
    const runner = await registerRunner();

    await request(app.getHttpServer())
      .post(`/runners/${runner.runnerId}/heartbeat`)
      .send({ quotaRemainingToday: 250 })
      .expect(401);

    await request(app.getHttpServer())
      .post(`/runners/${runner.runnerId}/heartbeat`)
      .set("X-Runner-Token", "wrong-token")
      .send({ quotaRemainingToday: 250 })
      .expect(401);

    await request(app.getHttpServer())
      .post("/runners/missing-runner/heartbeat")
      .set("X-Runner-Token", runner.token)
      .send({ quotaRemainingToday: 250 })
      .expect(404);
  });

  it("returns 204 with an empty body when the queue is empty", async () => {
    const runner = await registerRunner();

    const response = await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", runner.token)
      .expect(204);

    expect(response.text).toBe("");
  });

  it("returns no work when a valid runner has no quota, is inactive, or already has a claim", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({ id: "issue-1", githubId: 42 });

    await db
      .update(runners)
      .set({ quotaRemainingToday: 0 })
      .where(eq(runners.id, runner.runnerId));
    await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", runner.token)
      .expect(204);

    await db
      .update(runners)
      .set({
        active: true,
        quotaRemainingToday: 500,
        lastSeenAt: new Date("2000-01-01T00:00:00Z"),
      })
      .where(eq(runners.id, runner.runnerId));
    await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", runner.token)
      .expect(204);

    const [expiredRunner] = await db
      .select()
      .from(runners)
      .where(eq(runners.id, runner.runnerId))
      .limit(1);
    expect(expiredRunner.active).toBe(false);

    await db
      .update(runners)
      .set({ active: true, lastSeenAt: new Date() })
      .where(eq(runners.id, runner.runnerId));
    await db
      .update(issues)
      .set({
        status: "CLAIMED",
        claimedBy: runner.runnerId,
        claimedAt: new Date(),
      })
      .where(eq(issues.id, "issue-1"));

    await seedIssue({ id: "issue-2", githubId: 43 });
    await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", runner.token)
      .expect(204);
  });

  it("requeues timed-out claims during dispatch maintenance", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({
      id: "stale-claim",
      githubId: 42,
      status: "CLAIMED",
      claimedBy: runner.runnerId,
      claimedAt: new Date("2000-01-01T00:00:00Z"),
      retryCount: 1,
    });

    const response = await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", runner.token)
      .expect(200);
    expect(response.body.id).toBe("stale-claim");

    const [issue] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, "stale-claim"))
      .limit(1);
    expect(issue.status).toBe("PENDING");
    expect(issue.retryCount).toBe(2);
    expect(issue.claimedBy).toBeNull();
    expect(issue.claimedAt).toBeNull();

    const [contribution] = await db.select().from(contributions).limit(1);
    expect(contribution).toMatchObject({
      issueId: "stale-claim",
      runnerId: runner.runnerId,
      status: "FAILED",
      errorMessage: "Claim timed out",
    });
  });

  it("dispatches the highest scored pending issue and ignores unavailable work", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({
      id: "low-score",
      githubId: 1,
      score: 50,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await seedIssue({
      id: "newer-high-score",
      githubId: 2,
      score: 90,
      createdAt: new Date("2026-01-02T00:00:00Z"),
    });
    await seedIssue({
      id: "older-high-score",
      githubId: 3,
      score: 90,
      createdAt: new Date("2026-01-01T00:00:00Z"),
    });
    await seedIssue({
      id: "claimed-higher-score",
      githubId: 4,
      score: 100,
      status: "CLAIMED",
      claimedBy: "other-runner",
      claimedAt: new Date(),
    });
    await seedIssue({
      id: "done-higher-score",
      githubId: 5,
      score: 100,
      status: "DONE",
    });
    await seedIssue({
      id: "failed-higher-score",
      githubId: 6,
      score: 100,
      status: "FAILED",
    });

    const response = await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", runner.token)
      .expect(200);

    expect(response.body).toMatchObject({
      id: "older-high-score",
      githubId: 3,
      repoUrl: "https://github.com/owner/repo",
      score: 90,
      status: "PENDING",
    });
  });

  it("claims a pending issue and persists ownership metadata", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({ id: "issue-1", githubId: 42 });

    const response = await request(app.getHttpServer())
      .post("/issues/issue-1/claim")
      .set("X-Runner-Token", runner.token)
      .expect(200);

    expect(response.body).toMatchObject({
      id: "issue-1",
      status: "CLAIMED",
      claimedBy: runner.runnerId,
    });
    expect(response.body.claimedAt).toEqual(expect.any(String));

    const [claimed] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, "issue-1"))
      .limit(1);
    expect(claimed.status).toBe("CLAIMED");
    expect(claimed.claimedBy).toBe(runner.runnerId);
    expect(claimed.claimedAt).toBeInstanceOf(Date);
  });

  it("rejects claim requests for unavailable, missing or unauthorized issues", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({
      id: "already-claimed",
      githubId: 42,
      status: "CLAIMED",
      claimedBy: runner.runnerId,
      claimedAt: new Date(),
    });
    await seedIssue({
      id: "already-done",
      githubId: 43,
      status: "DONE",
    });

    await request(app.getHttpServer())
      .post("/issues/already-claimed/claim")
      .set("X-Runner-Token", runner.token)
      .expect(409);

    await request(app.getHttpServer())
      .post("/issues/already-done/claim")
      .set("X-Runner-Token", runner.token)
      .expect(409);

    const missingRunner = await registerRunner("missing-issue-runner");
    await request(app.getHttpServer())
      .post("/issues/missing-issue/claim")
      .set("X-Runner-Token", missingRunner.token)
      .expect(404);

    await request(app.getHttpServer())
      .post("/issues/already-claimed/claim")
      .set("X-Runner-Token", "wrong-token")
      .expect(401);
  });

  it("rejects claims when runner capacity state forbids new work", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({ id: "issue-1", githubId: 42 });

    await db
      .update(runners)
      .set({ quotaRemainingToday: 0 })
      .where(eq(runners.id, runner.runnerId));
    await request(app.getHttpServer())
      .post("/issues/issue-1/claim")
      .set("X-Runner-Token", runner.token)
      .expect(409);

    await db
      .update(runners)
      .set({ quotaRemainingToday: 500, active: false })
      .where(eq(runners.id, runner.runnerId));
    await request(app.getHttpServer())
      .post("/issues/issue-1/claim")
      .set("X-Runner-Token", runner.token)
      .expect(409);

    await db
      .update(runners)
      .set({ active: true, lastSeenAt: new Date() })
      .where(eq(runners.id, runner.runnerId));
    await db
      .update(issues)
      .set({
        status: "CLAIMED",
        claimedBy: runner.runnerId,
        claimedAt: new Date(),
      })
      .where(eq(issues.id, "issue-1"));
    await seedIssue({ id: "issue-2", githubId: 43 });

    await request(app.getHttpServer())
      .post("/issues/issue-2/claim")
      .set("X-Runner-Token", runner.token)
      .expect(409);
  });

  it("records successful issue completion and creates a success contribution", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({ id: "issue-1", githubId: 42 });

    const next = await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", runner.token)
      .expect(200);
    expect(next.body.id).toBe("issue-1");

    await request(app.getHttpServer())
      .post("/issues/issue-1/claim")
      .set("X-Runner-Token", runner.token)
      .expect(200);

    await request(app.getHttpServer())
      .post("/issues/issue-1/done")
      .set("X-Runner-Token", runner.token)
      .send({
        success: true,
        prUrl: "https://github.com/owner/repo/pull/7",
        tokensUsed: 123,
        details: {
          verification: { status: "skipped", missingBuildSystem: true },
        },
      })
      .expect(204);

    const [done] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, "issue-1"))
      .limit(1);
    expect(done.status).toBe("DONE");
    expect(done.retryCount).toBe(0);

    const [contribution] = await db.select().from(contributions).limit(1);
    expect(contribution).toMatchObject({
      issueId: "issue-1",
      runnerId: runner.runnerId,
      prUrl: "https://github.com/owner/repo/pull/7",
      status: "SUCCESS",
      tokensUsed: 123,
      errorMessage: null,
      details: {
        verification: { status: "skipped", missingBuildSystem: true },
      },
    });
  });

  it("rejects invalid completion request bodies before recording contributions", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({
      id: "invalid-completion",
      githubId: 42,
      status: "CLAIMED",
      claimedBy: runner.runnerId,
      claimedAt: new Date(),
    });

    await request(app.getHttpServer())
      .post("/issues/invalid-completion/done")
      .set("X-Runner-Token", runner.token)
      .send({ success: true })
      .expect(400);

    await request(app.getHttpServer())
      .post("/issues/invalid-completion/done")
      .set("X-Runner-Token", runner.token)
      .send({
        success: true,
        prUrl: "https://github.com/owner/repo/issues/7",
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/issues/invalid-completion/done")
      .set("X-Runner-Token", runner.token)
      .send({
        success: false,
        tokensUsed: -1,
      })
      .expect(400);

    await request(app.getHttpServer())
      .post("/issues/invalid-completion/done")
      .set("X-Runner-Token", runner.token)
      .send({
        success: false,
        prUrl: "https://github.com/owner/repo/issues/7",
      })
      .expect(400);

    expect(await countRows("contributions")).toBe(0);
  });

  it("returns a failed issue to pending while retry budget remains", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({
      id: "retryable-issue",
      githubId: 42,
      status: "CLAIMED",
      claimedBy: runner.runnerId,
      claimedAt: new Date(),
      retryCount: 1,
    });

    await request(app.getHttpServer())
      .post("/issues/retryable-issue/done")
      .set("X-Runner-Token", runner.token)
      .send({
        success: false,
        tokensUsed: 456,
        errorMessage: "Tests failed",
        details: {
          verification: {
            status: "failed",
            command: ["npm", "test", "--silent"],
          },
        },
      })
      .expect(204);

    const [issue] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, "retryable-issue"))
      .limit(1);
    expect(issue.status).toBe("PENDING");
    expect(issue.retryCount).toBe(2);
    expect(issue.claimedBy).toBeNull();
    expect(issue.claimedAt).toBeNull();

    const [contribution] = await db.select().from(contributions).limit(1);
    expect(contribution).toMatchObject({
      issueId: "retryable-issue",
      runnerId: runner.runnerId,
      status: "FAILED",
      tokensUsed: 456,
      errorMessage: "Tests failed",
      details: {
        verification: {
          status: "failed",
          command: ["npm", "test", "--silent"],
        },
      },
    });
  });

  it("marks a failed issue as final when the retry limit is reached", async () => {
    const runner = await registerRunner();
    await seedRepo();
    await seedIssue({
      id: "final-failure",
      githubId: 42,
      status: "CLAIMED",
      claimedBy: runner.runnerId,
      claimedAt: new Date(),
      retryCount: 2,
    });

    await request(app.getHttpServer())
      .post("/issues/final-failure/done")
      .set("X-Runner-Token", runner.token)
      .send({
        success: false,
        errorMessage: "Still failing",
      })
      .expect(204);

    const [issue] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, "final-failure"))
      .limit(1);
    expect(issue.status).toBe("FAILED");
    expect(issue.retryCount).toBe(3);

    const [contribution] = await db.select().from(contributions).limit(1);
    expect(contribution).toMatchObject({
      issueId: "final-failure",
      runnerId: runner.runnerId,
      status: "FAILED",
      errorMessage: "Still failing",
    });
  });

  it("prevents another runner from completing a claimed issue", async () => {
    const owner = await registerRunner("owner");
    const intruder = await registerRunner("intruder");
    await seedRepo();
    await seedIssue({
      id: "claimed-by-owner",
      githubId: 42,
      status: "CLAIMED",
      claimedBy: owner.runnerId,
      claimedAt: new Date(),
    });

    await request(app.getHttpServer())
      .post("/issues/claimed-by-owner/done")
      .set("X-Runner-Token", intruder.token)
      .send({
        success: true,
        prUrl: "https://github.com/owner/repo/pull/7",
      })
      .expect(401);

    const [issue] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, "claimed-by-owner"))
      .limit(1);
    expect(issue.status).toBe("CLAIMED");
    expect(issue.claimedBy).toBe(owner.runnerId);
    expect(await countRows("contributions")).toBe(0);
  });

  it("serves hub stats from persisted repos, issues, runners and contributions", async () => {
    const activeRunner = await registerRunner("active");
    const inactiveRunner = await registerRunner("inactive");
    await db
      .update(runners)
      .set({ active: false })
      .where(eq(runners.id, inactiveRunner.runnerId));

    await seedRepo({
      id: "repo-1",
      githubUrl: "https://github.com/owner/eligible",
      owner: "owner",
      name: "eligible",
      eligible: true,
    });
    await seedRepo({
      id: "ineligible-repo",
      githubUrl: "https://github.com/owner/ineligible",
      owner: "owner",
      name: "ineligible",
      eligible: false,
    });
    await seedIssue({ id: "pending", githubId: 1, status: "PENDING" });
    await seedIssue({
      id: "claimed",
      githubId: 2,
      status: "CLAIMED",
      claimedBy: activeRunner.runnerId,
      claimedAt: new Date(),
    });
    await seedIssue({ id: "done", githubId: 3, status: "DONE" });
    await seedIssue({ id: "failed", githubId: 4, status: "FAILED" });
    await db.insert(contributions).values([
      {
        id: "contribution-1",
        issueId: "done",
        runnerId: activeRunner.runnerId,
        prUrl: "https://github.com/owner/repo/pull/1",
        status: "SUCCESS",
      },
      {
        id: "contribution-2",
        issueId: "failed",
        runnerId: activeRunner.runnerId,
        status: "FAILED",
        errorMessage: "Failed",
      },
    ]);

    const response = await request(app.getHttpServer())
      .get("/stats")
      .expect(200);

    expect(response.body).toMatchObject({
      totalRepos: 2,
      eligibleRepos: 1,
      totalIssues: 4,
      pendingIssues: 1,
      queueSize: 1,
      claimedIssues: 1,
      doneIssues: 1,
      failedIssues: 1,
      totalPrsOpened: 2,
      activeRunners: 1,
    });
    expect(response.body.dispatchMatchingLatencySampleCount).toEqual(
      expect.any(Number),
    );
  });

  it("serves the admin scoring overview with queue health and diagnostics", async () => {
    await seedRepo({
      id: "repo-1",
      githubUrl: "https://github.com/owner/repo",
      owner: "owner",
      name: "repo",
      eligible: true,
    });
    await seedIssue({
      id: "diagnosed-issue",
      githubId: 99,
      status: "PENDING",
      score: 70,
    });

    const response = await request(app.getHttpServer())
      .get("/admin/scoring")
      .set("X-Admin-Token", adminToken)
      .expect(200);

    expect(response.body).toMatchObject({
      queueHealth: {
        queueSize: 1,
        databaseRankingRecommended: false,
        databaseRankingThresholds: {
          queueSize: 1000,
          p95MatchingLatencyMs: 100,
        },
      },
      recentRepositories: [
        expect.objectContaining({
          owner: "owner",
          name: "repo",
          scoreDiagnostic: expect.objectContaining({
            score: expect.any(Number),
            signals: expect.any(Array),
          }),
        }),
      ],
      recentIssues: [
        expect.objectContaining({
          id: "diagnosed-issue",
          repoOwner: "owner",
          repoName: "repo",
          scoreDiagnostic: expect.objectContaining({
            score: expect.any(Number),
            signals: expect.any(Array),
          }),
        }),
      ],
    });
  });

  it("protects seed endpoints with the admin token before any GitHub call", async () => {
    const fetchMock = vi.fn();
    vi.stubGlobal("fetch", fetchMock);

    await request(app.getHttpServer()).post("/seed/default").expect(401);
    await request(app.getHttpServer())
      .post("/seed/default")
      .set("X-Admin-Token", "wrong-admin-token")
      .expect(401);
    await request(app.getHttpServer())
      .post("/seed/repo")
      .query({ owner: "nodejs", name: "node" })
      .expect(401);
    await request(app.getHttpServer())
      .post("/seed/repo")
      .set("X-Admin-Token", "wrong-admin-token")
      .query({ owner: "nodejs", name: "node" })
      .expect(401);
    await request(app.getHttpServer()).get("/seed/ingestion-runs").expect(401);
    await request(app.getHttpServer())
      .get("/seed/ingestion-runs")
      .set("X-Admin-Token", "wrong-admin-token")
      .expect(401);

    expect(fetchMock).not.toHaveBeenCalled();
    expect(await countRows("repos")).toBe(0);
    expect(await countRows("issues")).toBe(0);
  });

  it("seeds a repository through the real GitHub service with GitHub HTTP mocked", async () => {
    const fetchMock = vi.fn(
      async (url: string | URL | Request): Promise<Response> => {
        const requestUrl = String(url);

        if (requestUrl.endsWith("/repos/acme/project")) {
          return jsonResponse(eligibleRepoFixture("TypeScript", 100));
        }

        if (
          requestUrl.endsWith("/repos/acme/project/git/trees/main?recursive=1")
        ) {
          return jsonResponse(eligibleTreeFixture());
        }

        if (
          requestUrl.endsWith(
            "/repos/acme/project/issues?state=open&labels=bug,good%20first%20issue,help%20wanted&per_page=100",
          )
        ) {
          return jsonResponse([
            {
              id: 1001,
              title: "Qualified bug",
              body: "Expected actual reproduce ".repeat(20),
              html_url: "https://github.com/acme/project/issues/1",
              labels: [
                { name: "bug" },
                { name: "good first issue" },
                { name: "help wanted" },
              ],
            },
            {
              id: 1002,
              title: "Too vague",
              body: "Needs work",
              html_url: "https://github.com/acme/project/issues/2",
              labels: [{ name: "question" }],
            },
            {
              id: 1003,
              title: "Open pull request",
              body: "This should not enter the issue queue",
              html_url: "https://github.com/acme/project/pull/3",
              labels: [
                { name: "bug" },
                { name: "good first issue" },
                { name: "help wanted" },
              ],
              pull_request: {},
            },
          ]);
        }

        return jsonResponse({ message: "not found" }, false);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    await request(app.getHttpServer())
      .post("/seed/repo")
      .set("X-Admin-Token", adminToken)
      .query({ owner: "acme", name: "project" })
      .expect(200);

    expect(fetchMock).toHaveBeenCalledTimes(3);

    const [repo] = await db
      .select()
      .from(repos)
      .where(eq(repos.githubUrl, "https://github.com/acme/project"))
      .limit(1);
    expect(repo).toMatchObject({
      owner: "acme",
      name: "project",
      language: "TypeScript",
      stars: 100,
      eligible: true,
    });
    expect(repo.lastCrawledAt).toBeInstanceOf(Date);

    const seededIssues = await db
      .select()
      .from(issues)
      .where(eq(issues.repoId, repo.id));
    expect(seededIssues).toHaveLength(1);
    expect(seededIssues[0]).toMatchObject({
      githubId: 1001,
      title: "Qualified bug",
      githubUrl: "https://github.com/acme/project/issues/1",
      labels: "bug,good first issue,help wanted",
      score: 85,
      status: "PENDING",
    });
  });

  it("discovers repositories from GitHub issue search and seeds each one once", async () => {
    const fetchMock = vi.fn(
      async (url: string | URL | Request): Promise<Response> => {
        const requestUrl = new URL(String(url));

        if (
          requestUrl.pathname === "/search/issues" &&
          requestUrl.searchParams.get("fixture") === "good-first-page-2"
        ) {
          return jsonResponse({
            items: [
              {
                repository_url: "https://api.github.com/repos/beta/tool",
              },
            ],
          });
        }

        if (
          requestUrl.pathname === "/search/issues" &&
          requestUrl.searchParams.get("q")?.includes("good first issue")
        ) {
          return jsonResponse(
            {
              items: [
                {
                  repository_url: "https://api.github.com/repos/acme/project",
                },
                {
                  repository_url: "https://api.github.com/repos/acme/project",
                  pull_request: {},
                },
              ],
            },
            true,
            {
              link: '<https://api.github.com/search/issues?fixture=good-first-page-2>; rel="next"',
            },
          );
        }

        if (
          requestUrl.pathname === "/search/issues" &&
          requestUrl.searchParams.get("q")?.includes("help wanted")
        ) {
          return jsonResponse({
            items: [
              {
                repository_url: "https://api.github.com/repos/acme/project",
              },
            ],
          });
        }

        if (requestUrl.pathname === "/repos/acme/project") {
          return jsonResponse(eligibleRepoFixture("TypeScript", 100));
        }

        if (requestUrl.pathname === "/repos/beta/tool") {
          return jsonResponse(eligibleRepoFixture("Python", 90));
        }

        if (
          requestUrl.pathname === "/repos/acme/project/git/trees/main" ||
          requestUrl.pathname === "/repos/beta/tool/git/trees/main"
        ) {
          return jsonResponse(eligibleTreeFixture());
        }

        if (requestUrl.pathname === "/repos/acme/project/issues") {
          return jsonResponse([
            {
              id: 2001,
              title: "Qualified acme issue",
              body: "Expected actual reproduce ".repeat(20),
              html_url: "https://github.com/acme/project/issues/10",
              labels: [
                { name: "bug" },
                { name: "good first issue" },
                { name: "help wanted" },
              ],
            },
            {
              id: 2002,
              title: "Something broken",
              body: "",
              html_url: "https://github.com/acme/project/issues/11",
              labels: [],
            },
          ]);
        }

        if (requestUrl.pathname === "/repos/beta/tool/issues") {
          return jsonResponse([
            {
              id: 3001,
              title: "Qualified beta issue",
              body: "Expected actual reproduce ".repeat(20),
              html_url: "https://github.com/beta/tool/issues/20",
              labels: [
                { name: "bug" },
                { name: "good first issue" },
                { name: "help wanted" },
              ],
            },
          ]);
        }

        return jsonResponse({ message: "not found" }, false);
      },
    );
    vi.stubGlobal("fetch", fetchMock);

    const response = await request(app.getHttpServer())
      .post("/seed/discover")
      .set("X-Admin-Token", adminToken)
      .expect(202);

    expect(response.body).toEqual({ runId: expect.any(String) });

    const run = await waitForCompletedIngestionRun(
      response.body.runId as string,
    );

    expect(await countRows("repos")).toBe(2);
    expect(await countRows("issues")).toBe(2);

    expect(run).toMatchObject({
      status: "SUCCESS",
      discoveredRepos: 2,
      seededRepos: 2,
      recrawledRepos: 0,
      createdIssues: 2,
      skippedPullRequests: 0,
      failedRepositories: 0,
    });
    expect(run.details).toEqual(
      expect.objectContaining({
        labels: expect.arrayContaining([
          expect.objectContaining({
            label: "good first issue",
            pages: 2,
            repositoryHits: 2,
            skippedPullRequests: 1,
          }),
        ]),
        repositories: expect.arrayContaining([
          expect.objectContaining({
            owner: "acme",
            name: "project",
            action: "seeded",
            skippedLowScoreIssues: 1,
            rejectedIssueDiagnostics: expect.arrayContaining([
              expect.objectContaining({
                githubId: 2002,
                title: "Something broken",
                score: 0,
                diagnostic: expect.objectContaining({
                  signals: expect.arrayContaining([
                    expect.objectContaining({
                      name: "missingBody",
                      points: -30,
                    }),
                  ]),
                }),
              }),
            ]),
          }),
        ]),
      }),
    );
    expect(run.finishedAt).toBeInstanceOf(Date);

    const runsResponse = await request(app.getHttpServer())
      .get("/seed/ingestion-runs")
      .set("X-Admin-Token", adminToken)
      .expect(200);

    expect(runsResponse.body[0]).toMatchObject({
      id: response.body.runId,
      status: "SUCCESS",
      discoveredRepos: 2,
      failedRepositories: 0,
    });
    expect(runsResponse.body[0].startedAt).toEqual(expect.any(String));
    expect(runsResponse.body[0].details.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "acme",
          name: "project",
          action: "seeded",
        }),
      ]),
    );
  });

  it("records partial success when one discovered repository fails", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async (url: string | URL | Request): Promise<Response> => {
        const requestUrl = new URL(String(url));

        if (
          requestUrl.pathname === "/search/issues" &&
          requestUrl.searchParams.get("q")?.includes("good first issue")
        ) {
          return jsonResponse({
            items: [
              {
                repository_url: "https://api.github.com/repos/acme/missing",
              },
              {
                repository_url: "https://api.github.com/repos/acme/healthy",
              },
            ],
          });
        }

        if (
          requestUrl.pathname === "/search/issues" &&
          requestUrl.searchParams.get("q")?.includes("help wanted")
        ) {
          return jsonResponse({ items: [] });
        }

        if (requestUrl.pathname === "/repos/acme/missing") {
          return jsonResponse({ message: "not found" }, false, {}, 404);
        }

        if (requestUrl.pathname === "/repos/acme/healthy") {
          return jsonResponse(eligibleRepoFixture("TypeScript", 100));
        }

        if (requestUrl.pathname === "/repos/acme/healthy/git/trees/main") {
          return jsonResponse(eligibleTreeFixture());
        }

        if (requestUrl.pathname === "/repos/acme/healthy/issues") {
          return jsonResponse([
            {
              id: 4001,
              title: "Qualified healthy issue",
              body: "Expected actual reproduce ".repeat(20),
              html_url: "https://github.com/acme/healthy/issues/1",
              labels: [
                { name: "bug" },
                { name: "good first issue" },
                { name: "help wanted" },
              ],
            },
          ]);
        }

        return jsonResponse({ message: "not found" }, false);
      }),
    );

    const response = await request(app.getHttpServer())
      .post("/seed/discover")
      .set("X-Admin-Token", adminToken)
      .expect(202);

    expect(response.body).toEqual({ runId: expect.any(String) });

    const run = await waitForCompletedIngestionRun(
      response.body.runId as string,
    );
    expect(run).toMatchObject({
      status: "PARTIAL_SUCCESS",
      discoveredRepos: 2,
      seededRepos: 1,
      createdIssues: 1,
      failedRepositories: 1,
    });
    expect(run.details).toEqual(
      expect.objectContaining({
        repositories: expect.arrayContaining([
          expect.objectContaining({
            owner: "acme",
            name: "missing",
            action: "failed",
            statusCode: 404,
          }),
          expect.objectContaining({
            owner: "acme",
            name: "healthy",
            action: "seeded",
          }),
        ]),
      }),
    );
  });

  it("records rate-limited ingestion runs", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          { message: "rate limited" },
          false,
          { "x-ratelimit-remaining": "0" },
          403,
        ),
      ),
    );

    const response = await request(app.getHttpServer())
      .post("/seed/discover")
      .set("X-Admin-Token", adminToken)
      .expect(202);

    expect(response.body).toEqual({ runId: expect.any(String) });

    const run = await waitForCompletedIngestionRun(
      response.body.runId as string,
    );
    expect(run).toMatchObject({
      status: "RATE_LIMITED",
      errorMessage: "GitHub API rate-limited with 403",
    });
    expect(run.finishedAt).toBeInstanceOf(Date);
  });

  async function registerRunner(
    contributorName = "octocat",
  ): Promise<RegisterResponse> {
    const response = await request(app.getHttpServer())
      .post("/runners/register")
      .send({ contributorName })
      .expect(200);
    const runner = response.body as RegisterResponse;
    await db
      .update(runners)
      .set({ quotaRemainingToday: 500, lastSeenAt: new Date(), active: true })
      .where(eq(runners.id, runner.runnerId));
    return runner;
  }

  async function seedRepo(
    values: {
      id?: string;
      githubUrl?: string;
      owner?: string;
      name?: string;
      language?: string | null;
      ecosystems?: string[];
      license?: string | null;
      ciDetected?: boolean;
      testsDetected?: boolean;
      score?: number;
      stars?: number;
      eligible?: boolean;
    } = {},
  ): Promise<void> {
    await db.insert(repos).values({
      id: values.id ?? "repo-1",
      githubUrl: values.githubUrl ?? "https://github.com/owner/repo",
      owner: values.owner ?? "owner",
      name: values.name ?? "repo",
      language: values.language,
      ecosystems: values.ecosystems ?? [],
      license: values.license,
      ciDetected: values.ciDetected ?? false,
      testsDetected: values.testsDetected ?? false,
      score: values.score ?? 0,
      stars: values.stars ?? 100,
      eligible: values.eligible ?? true,
    });
  }

  async function seedIssue(input: SeedIssueInput): Promise<void> {
    const createdAt = input.createdAt ?? new Date("2026-01-01T00:00:00Z");
    await db.insert(issues).values({
      id: input.id,
      repoId: "repo-1",
      githubId: input.githubId,
      title: input.title ?? "Fix it",
      body: input.body ?? "Expected actual reproduce ".repeat(20),
      githubUrl: `https://github.com/owner/repo/issues/${input.githubId}`,
      labels: input.labels ?? "bug,good first issue,help wanted",
      score: input.score ?? 85,
      status: input.status ?? "PENDING",
      claimedBy: input.claimedBy ?? null,
      claimedAt: input.claimedAt ?? null,
      retryCount: input.retryCount ?? 0,
      createdAt,
      updatedAt: input.updatedAt ?? createdAt,
    });
  }

  async function truncateDb(): Promise<void> {
    await pool.query(
      "TRUNCATE runtime_config_override, ingestion_runs, contributions, issues, runners, repos RESTART IDENTITY CASCADE",
    );
  }

  async function countRows(
    table: "contributions" | "issues" | "repos" | "runners",
  ): Promise<number> {
    const result = await pool.query<{ count: string }>(
      `SELECT count(*)::int FROM ${table}`,
    );
    return Number(result.rows[0]?.count ?? 0);
  }

  async function waitForCompletedIngestionRun(runId: string) {
    const deadline = Date.now() + 3000;

    while (Date.now() < deadline) {
      const [run] = await db
        .select()
        .from(ingestionRuns)
        .where(eq(ingestionRuns.id, runId))
        .limit(1);

      if (run && run.status !== "STARTED") {
        return run;
      }

      await new Promise((resolve) => globalThis.setTimeout(resolve, 10));
    }

    throw new Error(`Timed out waiting for ingestion run ${runId}`);
  }
});

function restoreEnv(name: string, value: string | undefined): void {
  if (value === undefined) {
    delete process.env[name];
  } else {
    process.env[name] = value;
  }
}

function eligibleRepoFixture(language: string, stars: number) {
  return {
    stargazers_count: stars,
    language,
    default_branch: "main",
    pushed_at: new Date().toISOString(),
  };
}

function eligibleTreeFixture() {
  return {
    tree: [
      { path: ".github/workflows/ci.yml", type: "blob" },
      { path: "src/example.spec.ts", type: "blob" },
      { path: "package.json", type: "blob" },
    ],
  };
}

function jsonResponse(
  body: unknown,
  ok = true,
  headers: Record<string, string> = {},
  status = ok ? 200 : 404,
): Response {
  return {
    ok,
    status,
    headers: {
      get(name: string): string | null {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    json: async () => body,
  } as Response;
}
