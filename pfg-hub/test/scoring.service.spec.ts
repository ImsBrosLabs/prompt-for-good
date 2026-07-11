import { describe, expect, it } from "vitest";
import { ScoringService } from "../src/scoring/scoring.service";

describe("ScoringService", () => {
  const service = new ScoringService();

  it("scores issue labels and body signals", () => {
    const score = service.scoreIssue({
      labels: "bug,good first issue,help wanted",
      body: "Expected the command to work, actual result fails. Steps to reproduce with a failing test. ".repeat(
        4,
      ),
    });

    expect(score).toBe(85);
  });

  it("caps issue scores at 100", () => {
    const score = service.scoreIssue({
      labels: "bug,good first issue,help wanted,pfg-eligible",
      body: "Expected actual reproduce failing test. ".repeat(20),
    });

    expect(score).toBe(100);
  });

  it("requires healthy and recently active repositories", () => {
    const now = new Date("2026-01-01T00:00:00Z");
    const healthyRepo = {
      stars: 50,
      ciDetected: true,
      testsDetected: true,
      lastPushedAt: new Date("2025-12-15T00:00:00Z"),
    };

    expect(service.scoreRepo(healthyRepo, now)).toBe(90);
    expect(service.isRepoEligible(healthyRepo, now)).toBe(true);
    expect(
      service.isRepoEligible({ ...healthyRepo, testsDetected: false }, now),
    ).toBe(false);
    expect(
      service.isRepoEligible(
        { ...healthyRepo, lastPushedAt: new Date("2025-09-01T00:00:00Z") },
        now,
      ),
    ).toBe(false);
  });

  it("estimates scope and rejects incompatible runner preferences", () => {
    const assessment = service.assessIssue({
      title: "Migrate the authentication architecture",
      labels: "bug",
      body: "Expected a migration plan with acceptance criteria and a failing test.",
    });
    const candidate = {
      labels: "bug,good first issue",
      score: 85,
      difficulty: "easy" as const,
      estimatedMinutes: 30,
      createdAt: new Date("2026-01-01T00:00:00Z"),
      owner: "acme",
      name: "project",
      language: "TypeScript",
      ecosystems: ["npm"],
      license: "MIT",
    };

    expect(assessment).toMatchObject({
      difficulty: "hard",
      estimatedMinutes: 240,
    });
    expect(
      service.matchRunnerPreferences(candidate, {
        languages: ["typescript"],
        labels: ["bug"],
        maxDifficulty: "easy",
      }),
    ).toBeGreaterThan(0);
    expect(
      service.matchRunnerPreferences(candidate, {
        blockedRepos: ["acme/project"],
      }),
    ).toBeNull();
    expect(
      service.matchRunnerPreferences(candidate, { maxEstimatedMinutes: 20 }),
    ).toBeNull();
  });

  it("calibrates representative repository scoring scenarios", () => {
    const now = new Date("2026-01-01T00:00:00Z");

    expect(
      service.assessRepo(
        {
          stars: 120,
          ciDetected: true,
          testsDetected: true,
          lastPushedAt: new Date("2025-12-01T00:00:00Z"),
        },
        now,
      ),
    ).toMatchObject({
      score: 90,
      eligible: true,
      diagnostic: {
        signals: expect.arrayContaining([
          expect.objectContaining({ name: "ciDetected", points: 25 }),
          expect.objectContaining({ name: "testsDetected", points: 25 }),
          expect.objectContaining({ name: "recentActivity", points: 20 }),
        ]),
      },
    });

    expect(
      service.assessRepo(
        {
          stars: 2000,
          ciDetected: true,
          testsDetected: false,
          lastPushedAt: new Date("2025-12-01T00:00:00Z"),
        },
        now,
      ),
    ).toMatchObject({
      score: 75,
      eligible: false,
    });
  });

  it("calibrates representative solvability scenarios", () => {
    const actionable = service.assessIssue({
      title: "Fix date parsing error",
      labels: "bug,pfg-eligible",
      body: [
        "Expected parsing to keep the timezone, actual output drops it.",
        "Steps to reproduce are listed below with a failing test.",
        "Acceptance criteria:",
        "- [ ] preserves timezone",
        "```ts\nexpect(parseDate(input)).toEqual(expected)\n```",
      ].join("\n"),
    });
    const vague = service.assessIssue({
      title: "Something broken",
      labels: "",
      body: "Something is broken.",
    });
    const broad = service.assessIssue({
      title: "Refactor the complete architecture",
      labels: "help wanted",
      body: "Expected a migration plan. Actual system has legacy architecture. ".repeat(
        120,
      ),
    });

    expect(actionable).toMatchObject({
      score: 90,
      difficulty: "medium",
      diagnostic: {
        signals: expect.arrayContaining([
          expect.objectContaining({ name: "reproductionSteps", points: 15 }),
          expect.objectContaining({ name: "acceptanceCriteria", points: 10 }),
          expect.objectContaining({
            name: "testableExpectedBehavior",
            points: 5,
          }),
        ]),
      },
    });
    expect(vague).toMatchObject({
      score: 0,
      diagnostic: {
        signals: expect.arrayContaining([
          expect.objectContaining({ name: "ambiguousScope", points: -20 }),
        ]),
      },
    });
    expect(broad).toMatchObject({
      difficulty: "hard",
      estimatedMinutes: 300,
      diagnostic: {
        signals: expect.arrayContaining([
          expect.objectContaining({ name: "tooBroadScope", points: -15 }),
        ]),
      },
    });
  });
});
