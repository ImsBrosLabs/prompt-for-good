import { Injectable } from "@nestjs/common";
import { Issue, IssueDifficulty, Repo, RunnerPreferences } from "../db/schema";

export type IssueAssessment = {
  score: number;
  difficulty: IssueDifficulty;
  estimatedMinutes: number;
  diagnostic: ScoringDiagnostic;
};

export type RepoAssessment = {
  score: number;
  eligible: boolean;
  diagnostic: ScoringDiagnostic;
};

export type DispatchMatch =
  | {
      compatible: true;
      affinity: number;
      diagnostic: ScoringDiagnostic;
    }
  | {
      compatible: false;
      affinity: null;
      diagnostic: ScoringDiagnostic;
    };

export type ScoringSignal = {
  name: string;
  points: number;
  evidence: string;
};

export type ScoringDiagnostic = {
  score: number;
  signals: ScoringSignal[];
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
  /** Assesses repository health from deterministic popularity, CI, tests and activity signals. */
  assessRepo(repo: RepoScoreInput, now = new Date()): RepoAssessment {
    const signals: ScoringSignal[] = [];

    this.addSignal(signals, repo.stars >= 50, {
      name: "minimumStars",
      points: 20,
      evidence: `stars=${repo.stars}`,
    });
    this.addSignal(signals, repo.stars >= 250, {
      name: "establishedProject",
      points: 5,
      evidence: `stars=${repo.stars}`,
    });
    this.addSignal(signals, repo.stars >= 1000, {
      name: "highTrustProject",
      points: 5,
      evidence: `stars=${repo.stars}`,
    });
    this.addSignal(signals, repo.ciDetected, {
      name: "ciDetected",
      points: 25,
      evidence: "repository tree contains CI configuration",
    });
    this.addSignal(signals, repo.testsDetected, {
      name: "testsDetected",
      points: 25,
      evidence: "repository tree contains test files or directories",
    });
    this.addSignal(signals, this.isRecentlyActive(repo.lastPushedAt, now), {
      name: "recentActivity",
      points: 20,
      evidence: `lastPushedAt=${repo.lastPushedAt?.toISOString() ?? "unknown"}`,
    });

    const score = this.sumSignals(signals);
    return {
      score,
      eligible:
        repo.stars >= 50 &&
        repo.ciDetected &&
        repo.testsDetected &&
        this.isRecentlyActive(repo.lastPushedAt, now),
      diagnostic: { score, signals },
    };
  }

  /** Preserves the score-only API for callers that do not need assessment data. */
  scoreRepo(repo: RepoScoreInput, now = new Date()): number {
    return this.assessRepo(repo, now).score;
  }

  /** Requires an active, testable project rather than a popular but stale repo. */
  isRepoEligible(repo: RepoScoreInput, now = new Date()): boolean {
    return this.assessRepo(repo, now).eligible;
  }

  /** Returns deterministic score, execution-size metadata and signal diagnostics. */
  assessIssue(issue: IssueScoreInput): IssueAssessment {
    const labels = (issue.labels ?? "").toLowerCase();
    const body = issue.body ?? "";
    const text = `${issue.title ?? ""}\n${labels}\n${body}`.toLowerCase();
    const signals: ScoringSignal[] = [];

    this.addSignal(signals, labels.includes("good first issue"), {
      name: "goodFirstIssueLabel",
      points: 25,
      evidence: "matched good first issue label",
    });
    this.addSignal(signals, labels.includes("bug"), {
      name: "bugLabel",
      points: 15,
      evidence: "matched bug label",
    });
    this.addSignal(signals, labels.includes("help wanted"), {
      name: "helpWantedLabel",
      points: 10,
      evidence: "matched help wanted label",
    });
    this.addSignal(signals, labels.includes("pfg-eligible"), {
      name: "maintainerOptIn",
      points: 25,
      evidence: "matched pfg-eligible label",
    });
    this.addSignal(signals, body.length >= 200, {
      name: "substantialDescription",
      points: 10,
      evidence: `bodyLength=${body.length}`,
    });
    this.addSignal(signals, this.hasAll(text, ["expected", "actual"]), {
      name: "expectedActualBehavior",
      points: 10,
      evidence: "matched expected and actual behavior terms",
    });
    this.addSignal(
      signals,
      text.includes("reproduce") || text.includes("failing test"),
      {
        name: "reproductionSteps",
        points: 15,
        evidence: text.includes("failing test")
          ? "matched failing test"
          : "matched reproduce",
      },
    );
    this.addSignal(
      signals,
      text.includes("acceptance criteria") ||
        text.includes("acceptance checklist") ||
        text.includes("- [ ]"),
      {
        name: "acceptanceCriteria",
        points: 10,
        evidence: text.includes("- [ ]")
          ? "matched checklist item"
          : "matched acceptance criteria language",
      },
    );
    this.addSignal(signals, text.includes("```"), {
      name: "testableExpectedBehavior",
      points: 5,
      evidence: "body contains fenced code block",
    });
    this.addSignal(signals, !body.trim(), {
      name: "missingBody",
      points: -30,
      evidence: "body is empty",
    });
    this.addSignal(
      signals,
      this.hasAll(text, ["something", "broken"]) || text.length < 80,
      {
        name: "ambiguousScope",
        points: -20,
        evidence:
          text.length < 80
            ? `textLength=${text.length}`
            : "matched vague broken wording",
      },
    );
    this.addSignal(signals, body.length > 5000, {
      name: "tooBroadScope",
      points: -15,
      evidence: `bodyLength=${body.length}`,
    });

    const rawScore = this.sumSignals(signals);
    const score = Math.max(0, Math.min(rawScore, 100));
    const difficulty = this.estimateDifficulty(text);
    return {
      score,
      difficulty,
      estimatedMinutes: this.estimateMinutes(difficulty, body.length),
      diagnostic: { score, signals },
    };
  }

  /** Preserves the score-only API for callers that do not need assessment data. */
  scoreIssue(issue: IssueScoreInput): number {
    return this.assessIssue(issue).score;
  }

  /** Rejects incompatible work and explains affinity for a specific runner. */
  assessRunnerPreferences(
    candidate: DispatchCandidate,
    preferences: RunnerPreferences,
  ): DispatchMatch {
    const repo = `${candidate.owner}/${candidate.name}`.toLowerCase();
    const labels = this.normalizedLabels(candidate.labels);
    const language = candidate.language?.toLowerCase() ?? "";
    const ecosystems = candidate.ecosystems.map((value) => value.toLowerCase());
    const license = candidate.license?.toLowerCase() ?? "";
    const signals: ScoringSignal[] = [];

    if (!this.matchesOptionalList(preferences.allowedRepos, repo)) {
      return this.rejectedDispatchMatch("allowedRepoMismatch", repo);
    }
    if (this.includes(preferences.blockedRepos, repo)) {
      return this.rejectedDispatchMatch("blockedRepo", repo);
    }
    if (!this.matchesOptionalList(preferences.languages, language)) {
      return this.rejectedDispatchMatch("languageMismatch", language);
    }
    if (!this.matchesAnyOptional(preferences.ecosystems, ecosystems)) {
      return this.rejectedDispatchMatch(
        "ecosystemMismatch",
        ecosystems.join(",") || "none",
      );
    }
    if (!this.matchesOptionalList(preferences.licenses, license)) {
      return this.rejectedDispatchMatch("licenseMismatch", license || "none");
    }
    if (!this.matchesAnyOptional(preferences.labels, labels)) {
      return this.rejectedDispatchMatch("labelMismatch", labels.join(","));
    }
    if (
      preferences.maxDifficulty &&
      difficultyRank[candidate.difficulty] >
        difficultyRank[preferences.maxDifficulty]
    ) {
      return this.rejectedDispatchMatch(
        "maxDifficultyExceeded",
        `${candidate.difficulty}>${preferences.maxDifficulty}`,
      );
    }
    if (
      preferences.maxEstimatedMinutes !== undefined &&
      candidate.estimatedMinutes > preferences.maxEstimatedMinutes
    ) {
      return this.rejectedDispatchMatch(
        "maxEstimatedMinutesExceeded",
        `${candidate.estimatedMinutes}>${preferences.maxEstimatedMinutes}`,
      );
    }

    this.addSignal(signals, this.includes(preferences.allowedRepos, repo), {
      name: "allowedRepo",
      points: 6,
      evidence: repo,
    });
    this.addSignal(signals, this.includes(preferences.languages, language), {
      name: "language",
      points: 3,
      evidence: language || "unknown",
    });
    this.addSignal(signals, this.matchesAny(preferences.ecosystems, ecosystems), {
      name: "ecosystem",
      points: 3,
      evidence: ecosystems.join(",") || "none",
    });
    this.addSignal(signals, this.includes(preferences.licenses, license), {
      name: "license",
      points: 2,
      evidence: license || "unknown",
    });
    this.addSignal(signals, this.matchesAny(preferences.labels, labels), {
      name: "label",
      points: 4,
      evidence: labels.join(",") || "none",
    });
    this.addSignal(signals, Boolean(preferences.maxDifficulty), {
      name: "difficultyBound",
      points: 1,
      evidence: preferences.maxDifficulty ?? "none",
    });
    this.addSignal(signals, preferences.maxEstimatedMinutes !== undefined, {
      name: "runtimeBound",
      points: 1,
      evidence:
        preferences.maxEstimatedMinutes === undefined
          ? "none"
          : `maxEstimatedMinutes=${preferences.maxEstimatedMinutes}`,
    });

    const affinity = this.sumSignals(signals);
    return {
      compatible: true,
      affinity,
      diagnostic: { score: affinity, signals },
    };
  }

  /** Preserves the affinity-only API while the dispatch service adopts diagnostics. */
  matchRunnerPreferences(
    candidate: DispatchCandidate,
    preferences: RunnerPreferences,
  ): number | null {
    const match = this.assessRunnerPreferences(candidate, preferences);
    return match.compatible ? match.affinity : null;
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

  private addSignal(
    signals: ScoringSignal[],
    condition: boolean,
    signal: ScoringSignal,
  ): void {
    if (condition) signals.push(signal);
  }

  private sumSignals(signals: ScoringSignal[]): number {
    return signals.reduce((total, signal) => total + signal.points, 0);
  }

  private rejectedDispatchMatch(
    name: string,
    evidence: string,
  ): DispatchMatch {
    return {
      compatible: false,
      affinity: null,
      diagnostic: {
        score: 0,
        signals: [{ name, points: 0, evidence }],
      },
    };
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
