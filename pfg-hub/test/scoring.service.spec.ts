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

  it("marks repositories with at least 50 stars as eligible", () => {
    expect(service.isRepoEligible({ stars: 49 })).toBe(false);
    expect(service.isRepoEligible({ stars: 50 })).toBe(true);
  });
});
