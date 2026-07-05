import { Inject, Injectable } from "@nestjs/common";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { loadConfig } from "../config";
import { DATABASE, Database } from "../db/database.module";
import { Issue, issues, repos } from "../db/schema";
import { ScoringService } from "../scoring/scoring.service";

type GitHubRepoResponse = {
  stargazers_count: number;
  language?: string | null;
};

type GitHubIssueResponse = {
  id: number;
  title: string;
  body?: string | null;
  html_url: string;
  labels?: Array<{ name?: string }>;
};

@Injectable()
export class GitHubService {
  private readonly apiBaseUrl = "https://api.github.com";

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ScoringService)
    private readonly scoringService: ScoringService,
  ) {}

  /** Imports a GitHub repository once and crawls it when it passes eligibility. */
  async seedRepo(owner: string, name: string): Promise<void> {
    const githubUrl = `https://github.com/${owner}/${name}`;
    const [existing] = await this.db
      .select()
      .from(repos)
      .where(eq(repos.githubUrl, githubUrl))
      .limit(1);
    if (existing) return;

    const repoData = await this.githubRequest<GitHubRepoResponse>(
      `/repos/${owner}/${name}`,
    );
    const stars = Number(repoData.stargazers_count ?? 0);
    const eligible = this.scoringService.isRepoEligible({ stars });

    const [repo] = await this.db
      .insert(repos)
      .values({
        id: randomUUID(),
        githubUrl,
        owner,
        name,
        language: repoData.language ?? null,
        stars,
        eligible,
      })
      .returning();

    if (repo.eligible) {
      await this.crawlRepo(repo.id);
    }
  }

  /** Fetches open GitHub issues for a repository and stores qualifying ones. */
  async crawlRepo(repoId: string): Promise<void> {
    const [repo] = await this.db
      .select()
      .from(repos)
      .where(eq(repos.id, repoId))
      .limit(1);
    if (!repo) throw new Error("Repo not found");

    const issueData = await this.githubRequest<GitHubIssueResponse[]>(
      `/repos/${repo.owner}/${repo.name}/issues?state=open&labels=bug,good%20first%20issue,help%20wanted`,
    );

    for (const item of issueData) {
      const [existing] = await this.db
        .select()
        .from(issues)
        .where(eq(issues.githubId, item.id))
        .limit(1);
      if (existing) continue;

      const labels = (item.labels ?? [])
        .map((label) => label.name)
        .filter(Boolean)
        .join(",");
      const candidate: Pick<Issue, "labels" | "body"> = {
        labels,
        body: item.body ?? null,
      };
      const score = this.scoringService.scoreIssue(candidate);

      if (score >= loadConfig().issueMinScore) {
        await this.db.insert(issues).values({
          id: randomUUID(),
          repoId: repo.id,
          githubId: item.id,
          title: item.title,
          body: item.body ?? null,
          githubUrl: item.html_url,
          labels,
          score,
          status: "PENDING",
          createdAt: new Date(),
          updatedAt: new Date(),
        });
      }
    }

    await this.db
      .update(repos)
      .set({ lastCrawledAt: new Date() })
      .where(eq(repos.id, repo.id));
  }

  /** Performs an authenticated GitHub API request and returns typed JSON. */
  private async githubRequest<T>(path: string): Promise<T> {
    const response = await fetch(`${this.apiBaseUrl}${path}`, {
      headers: {
        Authorization: `Bearer ${loadConfig().githubToken}`,
        Accept: "application/vnd.github.v3+json",
        "User-Agent": "prompt-for-good-hub",
      },
    });

    if (!response.ok) {
      throw new Error(`GitHub API request failed with ${response.status}`);
    }

    return (await response.json()) as T;
  }
}
