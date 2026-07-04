import { Test } from "@nestjs/testing";
import { INestApplication } from "@nestjs/common";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { eq } from "drizzle-orm";
import { Pool } from "pg";
import request from "supertest";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { AppModule } from "../src/app.module";
import { DATABASE, Database, PG_POOL } from "../src/db/database.module";
import { issues, repos } from "../src/db/schema";

const runDbTests = process.env.RUN_DB_TESTS === "true";
const describeDb = runDbTests ? describe : describe.skip;

describeDb("hub integration", () => {
  let app: INestApplication;
  let db: Database;
  let pool: Pool;
  const originalAdminKey = process.env.ADMIN_KEY;

  beforeAll(async () => {
    process.env.ADMIN_KEY = "test-admin-key";
    const moduleRef = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();
    app = moduleRef.createNestApplication<NestFastifyApplication>(
      new FastifyAdapter(),
    );
    await app.init();
    await app.getHttpAdapter().getInstance().ready();
    db = app.get<Database>(DATABASE);
    pool = app.get<Pool>(PG_POOL);
  });

  beforeEach(async () => {
    await pool.query(
      "TRUNCATE contributions, issues, runners, repos RESTART IDENTITY CASCADE",
    );
  });

  afterAll(async () => {
    if (originalAdminKey === undefined) {
      delete process.env.ADMIN_KEY;
    } else {
      process.env.ADMIN_KEY = originalAdminKey;
    }
    await app?.close();
  });

  it("registers a runner, dispatches an issue, claims it, and records success", async () => {
    const register = await request(app.getHttpServer())
      .post("/runners/register")
      .send({ contributorName: "octocat" })
      .expect(200);

    const token = register.body.token as string;
    const runnerId = register.body.runnerId as string;

    const [repo] = await db
      .insert(repos)
      .values({
        id: "repo-1",
        githubUrl: "https://github.com/owner/repo",
        owner: "owner",
        name: "repo",
        stars: 100,
        eligible: true,
      })
      .returning();

    await db.insert(issues).values({
      id: "issue-1",
      repoId: repo.id,
      githubId: 42,
      title: "Fix it",
      body: "Expected actual reproduce ".repeat(20),
      githubUrl: "https://github.com/owner/repo/issues/42",
      labels: "bug,good first issue,help wanted",
      score: 85,
      status: "PENDING",
      createdAt: new Date("2026-01-01T00:00:00Z"),
      updatedAt: new Date("2026-01-01T00:00:00Z"),
    });

    const next = await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", token)
      .expect(200);

    expect(next.body.id).toBe("issue-1");
    expect(next.body.repoUrl).toBe("https://github.com/owner/repo");

    const claimed = await request(app.getHttpServer())
      .post("/issues/issue-1/claim")
      .set("X-Runner-Token", token)
      .expect(200);

    expect(claimed.body.status).toBe("CLAIMED");
    expect(claimed.body.claimedBy).toBe(runnerId);

    await request(app.getHttpServer())
      .post("/issues/issue-1/done")
      .set("X-Runner-Token", token)
      .send({
        success: true,
        prUrl: "https://github.com/owner/repo/pull/7",
        tokensUsed: 123,
      })
      .expect(204);

    const [done] = await db
      .select()
      .from(issues)
      .where(eq(issues.id, "issue-1"))
      .limit(1);
    expect(done.status).toBe("DONE");
  });

  it("returns 204 when the queue is empty", async () => {
    const register = await request(app.getHttpServer())
      .post("/runners/register")
      .send({ contributorName: "octocat" })
      .expect(200);

    await request(app.getHttpServer())
      .get("/issues/next")
      .set("X-Runner-Token", register.body.token as string)
      .expect(204);
  });

  it("protects seed endpoints with the admin token", async () => {
    await request(app.getHttpServer()).post("/seed/default").expect(401);
  });
});
