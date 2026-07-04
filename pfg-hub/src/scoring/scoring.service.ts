import { Injectable } from "@nestjs/common";
import { Issue, Repo } from "../db/schema";

@Injectable()
export class ScoringService {
  scoreIssue(issue: Pick<Issue, "labels" | "body">): number {
    let score = 0;
    const labels = (issue.labels ?? "").toLowerCase();

    if (labels.includes("good first issue")) score += 25;
    if (labels.includes("bug")) score += 15;
    if (labels.includes("help wanted")) score += 10;
    if (labels.includes("pfg-eligible")) score += 30;

    const body = issue.body ?? "";
    if (body.length > 200) score += 10;
    if (
      body.toLowerCase().includes("expected") &&
      body.toLowerCase().includes("actual")
    ) {
      score += 10;
    }
    if (
      body.toLowerCase().includes("reproduce") ||
      body.toLowerCase().includes("failing test")
    ) {
      score += 15;
    }

    return Math.max(0, Math.min(score, 100));
  }

  isRepoEligible(repo: Pick<Repo, "stars">): boolean {
    return repo.stars >= 50;
  }
}
