import { Injectable } from "@nestjs/common";
import { Issue, IssueDifficulty, Repo, RunnerPreferences } from "../db/schema";

export type IssueAssessment = {
  score: number;
  difficulty: IssueDifficulty;
  estimatedMinutes: number;
};

type IssueScoreInput = Pick<Issue, "labels" | "body"> & {
  title?: string | null;
};

type RepoScoreInput = Pick<
  Repo,
  "stars" | "ciDetected" | "testsDetected" | "lastPushedAt"
>;

type DispatchCandidate = Pick<
  Issue,
  "labels" | "score" | "difficulty" | "estimatedMinutes" | "createdAt"
> &
  Pick<Repo, "owner" | "name" | "language" | "ecosystems" | "license">;

const ACTIVE_REPOSITORY_WINDOW_MS = 90 * 24 * 60 * 60 * 1000;
const difficultyRank: Record<IssueDifficulty, number> = {
  easy: 0,
  medium: 1,
  hard: 2,
};

@Injectable()
export class ScoringService {
  /** Scores repository health from popularity, CI, tests and recent activity. */
  scoreRepo(repo: RepoScoreInput, now = new Date()): number {
    let score = 0;

    if (repo.stars >= 50) score += 20;
    if (repo.stars >= 250) score += 5;
    if (repo.stars >= 1000) score += 5;
    if (repo.ciDetected) score += 25;
    if (repo.testsDetected) score += 25;
    if (this.isRecentlyActive(repo.lastPushedAt, now)) score += 20;

    return score;
  }

  /** Requires an active, testable project rather than a popular but stale repo. */
  isRepoEligible(repo: RepoScoreInput, now = new Date()): boolean {
    return (
      repo.stars >= 50 &&
      repo.ciDetected &&
      repo.testsDetected &&
      this.isRecentlyActive(repo.lastPushedAt, now)
    );
  }

  /** Returns score and execution-size metadata for an issue candidate. */
  assessIssue(issue: IssueScoreInput): IssueAssessment {
    const labels = (issue.labels ?? "").toLowerCase();
    const body = issue.body ?? "";
    const text = `${issue.title ?? ""}\n${labels}\n${body}`.toLowerCase();
    let score = 0;

    if (labels.includes("good first issue")) score += 25;
    if (labels.includes("bug")) score += 15;
    if (labels.includes("help wanted")) score += 10;
    if (labels.includes("pfg-eligible")) score += 25;

    if (body.length >= 200) score += 10;
    if (this.hasAll(text, ["expected", "actual"])) score += 10;
    if (text.includes("reproduce") || text.includes("failing test"))
      score += 15;
    if (
      text.includes("acceptance criteria") ||
      text.includes("acceptance checklist") ||
      text.includes("- [ ]")
    ) {
      score += 10;
    }
    if (text.includes("```")) score += 5;

    if (!body.trim()) score -= 30;
    if (this.hasAll(text, ["something", "broken"]) || text.length < 80) {
      score -= 20;
    }
    if (body.length > 5000) score -= 15;

    const difficulty = this.estimateDifficulty(text);
    return {
      score: Math.max(0, Math.min(score, 100)),
      difficulty,
      estimatedMinutes: this.estimateMinutes(difficulty, body.length),
    };
  }

  /** Preserves the score-only API for callers that do not need assessment data. */
  scoreIssue(issue: IssueScoreInput): number {
    return this.assessIssue(issue).score;
  }

  /** Rejects incompatible work and ranks compatible work for a specific runner. */
  matchRunnerPreferences(
    candidate: DispatchCandidate,
    preferences: RunnerPreferences,
  ): number | null {
    const repo = `${candidate.owner}/${candidate.name}`.toLowerCase();
    const labels = this.normalizedLabels(candidate.labels);
    const language = candidate.language?.toLowerCase() ?? "";
    const ecosystems = candidate.ecosystems.map((value) => value.toLowerCase());
    const license = candidate.license?.toLowerCase() ?? "";
    let affinity = 0;

    if (!this.matchesOptionalList(preferences.allowedRepos, repo)) return null;
    if (this.includes(preferences.blockedRepos, repo)) return null;
    if (!this.matchesOptionalList(preferences.languages, language)) return null;
    if (!this.matchesAnyOptional(preferences.ecosystems, ecosystems))
      return null;
    if (!this.matchesOptionalList(preferences.licenses, license)) return null;
    if (!this.matchesAnyOptional(preferences.labels, labels)) return null;
    if (
      preferences.maxDifficulty &&
      difficultyRank[candidate.difficulty] >
        difficultyRank[preferences.maxDifficulty]
    ) {
      return null;
    }
    if (
      preferences.maxEstimatedMinutes !== undefined &&
      candidate.estimatedMinutes > preferences.maxEstimatedMinutes
    ) {
      return null;
    }

    if (this.includes(preferences.allowedRepos, repo)) affinity += 6;
    if (this.includes(preferences.languages, language)) affinity += 3;
    if (this.matchesAny(preferences.ecosystems, ecosystems)) affinity += 3;
    if (this.includes(preferences.licenses, license)) affinity += 2;
    if (this.matchesAny(preferences.labels, labels)) affinity += 4;
    if (preferences.maxDifficulty) affinity += 1;
    if (preferences.maxEstimatedMinutes !== undefined) affinity += 1;
    return affinity;
  }

  private estimateDifficulty(text: string): IssueDifficulty {
    if (
      this.includesAny(text, [
        "breaking change",
        "migration",
        "refactor",
        "architecture",
        "race condition",
        "security",
        "performance regression",
      ])
    ) {
      return "hard";
    }
    if (
      this.includesAny(text, [
        "good first issue",
        "documentation",
        "docs",
        "typo",
        "small change",
      ])
    ) {
      return "easy";
    }
    return "medium";
  }

  private estimateMinutes(
    difficulty: IssueDifficulty,
    bodyLength: number,
  ): number {
    const baseMinutes = { easy: 30, medium: 90, hard: 240 }[difficulty];
    if (bodyLength > 5000) return baseMinutes + 60;
    if (bodyLength > 2000) return baseMinutes + 30;
    return baseMinutes;
  }

  private isRecentlyActive(lastPushedAt: Date | null, now: Date): boolean {
    return (
      lastPushedAt !== null &&
      lastPushedAt.getTime() >= now.getTime() - ACTIVE_REPOSITORY_WINDOW_MS
    );
  }

  private hasAll(text: string, terms: string[]): boolean {
    return terms.every((term) => text.includes(term));
  }

  private includesAny(text: string, terms: string[]): boolean {
    return terms.some((term) => text.includes(term));
  }

  private normalizedLabels(labels: string | null): string[] {
    return (labels ?? "")
      .split(",")
      .map((label) => label.trim().toLowerCase())
      .filter(Boolean);
  }

  private matchesOptionalList(
    values: string[] | undefined,
    candidate: string,
  ): boolean {
    return !values?.length || this.includes(values, candidate);
  }

  private matchesAnyOptional(
    values: string[] | undefined,
    candidates: string[],
  ): boolean {
    return !values?.length || this.matchesAny(values, candidates);
  }

  private matchesAny(
    values: string[] | undefined,
    candidates: string[],
  ): boolean {
    return Boolean(values?.some((value) => candidates.includes(value)));
  }

  private includes(values: string[] | undefined, candidate: string): boolean {
    return Boolean(values?.includes(candidate));
  }
}
