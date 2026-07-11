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
});
