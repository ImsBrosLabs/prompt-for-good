import {
  Inject,
  ConflictException,
  Injectable,
  Logger,
  OnApplicationBootstrap,
  OnApplicationShutdown,
} from "@nestjs/common";
import { SchedulerRegistry } from "@nestjs/schedule";
import { CronJob } from "cron";
import { desc, eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { APP_CONFIG, AppConfig } from "../config";
import { DATABASE, Database } from "../db/database.module";
import {
  IngestionRun,
  IngestionRunStatus,
  Issue,
  ingestionRuns,
  issues,
  repos,
} from "../db/schema";
import { ScoringService } from "../scoring/scoring.service";

type GitHubRepoResponse = {
  stargazers_count: number;
  language?: string | null;
  full_name?: string;
  archived?: boolean;
  disabled?: boolean;
  has_issues?: boolean;
};

type GitHubIssueResponse = {
  id: number;
  title: string;
  body?: string | null;
  html_url: string;
  labels?: Array<{ name?: string }>;
  pull_request?: unknown;
};

type GitHubSearchIssuesResponse = {
  items?: GitHubSearchIssueResponse[];
};

type GitHubSearchIssueResponse = {
  repository_url?: string;
  pull_request?: unknown;
};

type GitHubPageOptions = {
  maxPages?: number;
};

type GitHubRateLimitResource = "core" | "search" | string;

type GitHubResponseWithHeaders<T> = {
  data: T;
  linkHeader: string | null;
  rateLimitResource: GitHubRateLimitResource;
};

export type GitHubDiscoveryResult = {
  searchedLabels: string[];
  discoveredRepos: number;
  seededRepos: number;
  recrawledRepos: number;
  createdIssues: number;
  skippedPullRequests: number;
  failedRepositories: number;
  details: GitHubIngestionDetails;
};

export type GitHubIngestionDetails = {
  labels: GitHubIngestionLabelDetail[];
  repositories: GitHubIngestionRepositoryDetail[];
  warnings: string[];
  rateLimits: GitHubRateLimitSnapshot[];
};

type GitHubIngestionLabelDetail = {
  label: string;
  pages: number;
  repositoryHits: number;
  skippedPullRequests: number;
  skippedInvalidRepositoryUrls: number;
  stoppedReason?: string;
};

type GitHubIngestionRepositoryDetail = {
  owner: string;
  name: string;
  action:
    | "seeded"
    | "existing"
    | "ineligible"
    | "recrawled"
    | "failed"
    | "recrawl_failed";
  eligible?: boolean;
  createdIssues?: number;
  skippedPullRequests?: number;
  error?: string;
  statusCode?: number;
};

type GitHubRateLimitSnapshot = {
  resource: GitHubRateLimitResource;
  remaining: number | "unknown";
  resetAt?: string;
};

@Injectable()
export class GitHubService
  implements OnApplicationBootstrap, OnApplicationShutdown
{
  private readonly apiBaseUrl = "https://api.github.com";
  private readonly discoveryLabels = ["good first issue", "help wanted"];
  private readonly logger = new Logger(GitHubService.name);
  private readonly ingestionCronName = "github-ingestion";
  private ingestionRunning = false;
  private readonly rateLimitRemainingByResource = new Map<
    GitHubRateLimitResource,
    number
  >();
  private readonly rateLimitResetAtByResource = new Map<
    GitHubRateLimitResource,
    string
  >();

  constructor(
    @Inject(DATABASE) private readonly db: Database,
    @Inject(ScoringService)
    private readonly scoringService: ScoringService,
    @Inject(APP_CONFIG) private readonly config: AppConfig,
    @Inject(SchedulerRegistry)
    private readonly schedulerRegistry: SchedulerRegistry,
  ) {}

  onApplicationBootstrap(): void {
    if (!this.config.githubIngestionEnabled) {
      this.logger.log("GitHub ingestion cron disabled");
      return;
    }

    const job = CronJob.from({
      cronTime: this.config.githubIngestionCron,
      onTick: () => {
        void this.runIngestion().catch((error) => {
          this.logger.error(
            error instanceof Error ? error.message : "GitHub ingestion failed",
          );
        });
      },
      start: false,
    });
    this.schedulerRegistry.addCronJob(this.ingestionCronName, job);
    job.start();
    this.logger.log(
      `GitHub ingestion cron scheduled (${this.config.githubIngestionCron})`,
    );
  }

  onApplicationShutdown(): void {
    if (!this.config.githubIngestionEnabled) return;

    try {
      const job = this.schedulerRegistry.getCronJob(this.ingestionCronName);
      job.stop();
      this.schedulerRegistry.deleteCronJob(this.ingestionCronName);
    } catch {
      return;
    }
  }

  /** Returns recent ingestion audit runs for admin diagnostics. */
  async listIngestionRuns(limit = 20): Promise<IngestionRun[]> {
    const safeLimit = Math.min(Math.max(Math.trunc(limit) || 20, 1), 100);
    return this.db
      .select()
      .from(ingestionRuns)
      .orderBy(desc(ingestionRuns.startedAt))
      .limit(safeLimit);
  }

  /** Imports a GitHub repository once and crawls it when it passes eligibility. */
  async seedRepo(
    owner: string,
    name: string,
  ): Promise<{
    insertedRepo: boolean;
    repoEligible: boolean;
    crawl: GitHubCrawlResult | null;
  }> {
    const githubUrl = `https://github.com/${owner}/${name}`;
    this.logger.log(`Seeding GitHub repository ${owner}/${name}`);

    const [existing] = await this.db
      .select()
      .from(repos)
      .where(eq(repos.githubUrl, githubUrl))
      .limit(1);
    if (existing) {
      this.logger.log(
        `Skipping existing GitHub repository ${owner}/${name} eligible=${existing.eligible}`,
      );
      return {
        insertedRepo: false,
        repoEligible: existing.eligible,
        crawl: null,
      };
    }

    const repoData = await this.githubRequest<GitHubRepoResponse>(
      `/repos/${owner}/${name}`,
    );
    const canonicalRepo = this.canonicalRepository(owner, name, repoData);
    const canonicalGithubUrl = `https://github.com/${canonicalRepo.owner}/${canonicalRepo.name}`;
    if (canonicalGithubUrl !== githubUrl) {
      const [canonicalExisting] = await this.db
        .select()
        .from(repos)
        .where(eq(repos.githubUrl, canonicalGithubUrl))
        .limit(1);
      if (canonicalExisting) {
        this.logger.log(
          `Skipping existing canonical GitHub repository ${canonicalRepo.owner}/${canonicalRepo.name} requestedAs=${owner}/${name} eligible=${canonicalExisting.eligible}`,
        );
        return {
          insertedRepo: false,
          repoEligible: canonicalExisting.eligible,
          crawl: null,
        };
      }
    }

    const stars = Number(repoData.stargazers_count ?? 0);
    const hasIssues = repoData.has_issues ?? true;
    const repositoryActive =
      !repoData.archived && !repoData.disabled && hasIssues;
    const eligible =
      repositoryActive && this.scoringService.isRepoEligible({ stars });
    this.logger.log(
      `Fetched GitHub repository ${canonicalRepo.owner}/${canonicalRepo.name} requestedAs=${owner}/${name} stars=${stars} language=${repoData.language ?? "unknown"} archived=${repoData.archived ?? false} disabled=${repoData.disabled ?? false} hasIssues=${hasIssues} eligible=${eligible}`,
    );

    const [repo] = await this.db
      .insert(repos)
      .values({
        id: randomUUID(),
        githubUrl: canonicalGithubUrl,
        owner: canonicalRepo.owner,
        name: canonicalRepo.name,
        language: repoData.language ?? null,
        stars,
        eligible,
      })
      .returning();

    const crawl = repo.eligible ? await this.crawlRepo(repo.id) : null;
    this.logger.log(
      `Seeded GitHub repository ${repo.owner}/${repo.name} inserted=true eligible=${repo.eligible} createdIssues=${crawl?.createdIssues ?? 0}`,
    );

    return {
      insertedRepo: true,
      repoEligible: repo.eligible,
      crawl,
    };
  }

  /** Queues discovery and recrawls stale known repositories in the background. */
  async enqueueIngestion(): Promise<{ runId: string; status: "STARTED" }> {
    const runId = await this.startIngestionRun();

    void this.executeIngestionRun(runId).catch((error) => {
      this.logger.error(
        `Background GitHub ingestion run ${runId} failed error=${error instanceof Error ? error.message : "Unknown ingestion error"}`,
      );
    });

    return { runId, status: "STARTED" };
  }

  /** Runs discovery and recrawls stale known repositories with an audit row. */
  async runIngestion(): Promise<GitHubDiscoveryResult & { runId: string }> {
    const runId = await this.startIngestionRun();
    return this.executeIngestionRun(runId);
  }

  private async startIngestionRun(): Promise<string> {
    if (this.ingestionRunning) {
      this.logger.warn(
        "GitHub ingestion skipped because a run is already active",
      );
      throw new ConflictException("GitHub ingestion already running");
    }

    this.ingestionRunning = true;
    const runId = randomUUID();
    this.rateLimitRemainingByResource.clear();
    this.rateLimitResetAtByResource.clear();
    this.logger.log(`GitHub ingestion run ${runId} started`);

    try {
      await this.db.insert(ingestionRuns).values({
        id: runId,
        status: "STARTED",
        startedAt: new Date(),
      });
    } catch (error) {
      this.ingestionRunning = false;
      throw error;
    }

    return runId;
  }

  private async executeIngestionRun(
    runId: string,
  ): Promise<GitHubDiscoveryResult & { runId: string }> {
    const details = this.createIngestionDetails();

    try {
      const result = await this.discoverRepositories(details);
      result.details.rateLimits = this.githubRateLimitSnapshots();
      const status: IngestionRunStatus =
        result.failedRepositories > 0 ? "PARTIAL_SUCCESS" : "SUCCESS";
      await this.db
        .update(ingestionRuns)
        .set({
          status,
          discoveredRepos: result.discoveredRepos,
          seededRepos: result.seededRepos,
          recrawledRepos: result.recrawledRepos,
          createdIssues: result.createdIssues,
          skippedPullRequests: result.skippedPullRequests,
          failedRepositories: result.failedRepositories,
          details: result.details,
          finishedAt: new Date(),
        })
        .where(eq(ingestionRuns.id, runId));

      this.logger.log(
        `GitHub ingestion run ${runId} ${status.toLowerCase()} discoveredRepos=${result.discoveredRepos} seededRepos=${result.seededRepos} recrawledRepos=${result.recrawledRepos} createdIssues=${result.createdIssues} skippedPullRequests=${result.skippedPullRequests} failedRepositories=${result.failedRepositories}`,
      );
      return { ...result, runId };
    } catch (error) {
      const status: IngestionRunStatus =
        error instanceof GitHubRateLimitError ? "RATE_LIMITED" : "FAILED";
      details.rateLimits = this.githubRateLimitSnapshots();
      details.warnings.push(
        error instanceof Error ? error.message : "Unknown ingestion error",
      );
      const counters = this.ingestionCountersFromDetails(details);
      this.logger.error(
        `GitHub ingestion run ${runId} ${status.toLowerCase()} error=${error instanceof Error ? error.message : "Unknown ingestion error"}`,
      );
      await this.db
        .update(ingestionRuns)
        .set({
          status,
          ...counters,
          errorMessage:
            error instanceof Error ? error.message : "Unknown ingestion error",
          details,
          finishedAt: new Date(),
        })
        .where(eq(ingestionRuns.id, runId));
      throw error;
    } finally {
      this.ingestionRunning = false;
    }
  }

  private ingestionCountersFromDetails(
    details: GitHubIngestionDetails,
  ): Omit<GitHubDiscoveryResult, "searchedLabels" | "details"> {
    return {
      discoveredRepos: new Set(
        details.repositories.map((repo) => `${repo.owner}/${repo.name}`),
      ).size,
      seededRepos: details.repositories.filter(
        (repo) => repo.action === "seeded",
      ).length,
      recrawledRepos: details.repositories.filter(
        (repo) =>
          repo.action === "recrawled" || repo.action === "recrawl_failed",
      ).length,
      createdIssues: details.repositories.reduce(
        (sum, repo) => sum + (repo.createdIssues ?? 0),
        0,
      ),
      skippedPullRequests: details.labels.reduce(
        (sum, label) => sum + label.skippedPullRequests,
        0,
      ),
      failedRepositories: details.repositories.filter(
        (repo) => repo.action === "failed" || repo.action === "recrawl_failed",
      ).length,
    };
  }

  /** Discovers repositories from qualified open GitHub issues, then seeds them. */
  async discoverRepositories(
    details: GitHubIngestionDetails = this.createIngestionDetails(),
  ): Promise<GitHubDiscoveryResult> {
    const discovered = new Map<string, { owner: string; name: string }>();
    this.logger.log(
      `Discovering GitHub repositories from labels=${this.discoveryLabels.join(",")}`,
    );

    for (const label of this.discoveryLabels) {
      const labelDetail: GitHubIngestionLabelDetail = {
        label,
        pages: 0,
        repositoryHits: 0,
        skippedPullRequests: 0,
        skippedInvalidRepositoryUrls: 0,
      };
      details.labels.push(labelDetail);

      if (this.isGithubQuotaLow("search")) {
        labelDetail.stoppedReason = "search_quota_low";
        this.logger.warn(
          `Stopping GitHub discovery before label="${label}" because search quota is low remaining=${this.githubQuotaRemaining("search")}`,
        );
        break;
      }

      const query = `is:issue is:open label:"${label}"`;
      const path = `/search/issues?${new URLSearchParams({
        q: query,
        sort: "updated",
        order: "desc",
        per_page: "50",
      }).toString()}`;
      const pages =
        await this.githubRequestPaginated<GitHubSearchIssuesResponse>(path, {
          maxPages: this.config.githubDiscoveryMaxPagesPerLabel,
        });
      labelDetail.pages = pages.length;
      let discoveredForLabel = 0;

      for (const page of pages) {
        for (const item of page.items ?? []) {
          if (item.pull_request) {
            labelDetail.skippedPullRequests += 1;
            continue;
          }

          const repo = this.parseRepositoryApiUrl(item.repository_url);
          if (!repo) {
            labelDetail.skippedInvalidRepositoryUrls += 1;
            continue;
          }

          discovered.set(`${repo.owner}/${repo.name}`, repo);
          discoveredForLabel += 1;
          labelDetail.repositoryHits += 1;

          if (discovered.size >= this.config.githubDiscoveryMaxRepositories) {
            labelDetail.stoppedReason = "repository_limit";
            this.logger.log(
              `GitHub discovery repository limit reached maxRepositories=${this.config.githubDiscoveryMaxRepositories}`,
            );
            break;
          }
        }
        if (discovered.size >= this.config.githubDiscoveryMaxRepositories) {
          break;
        }
      }
      this.logger.log(
        `GitHub discovery label="${label}" pages=${pages.length} repositoryHits=${discoveredForLabel} skippedPullRequests=${labelDetail.skippedPullRequests} skippedInvalidRepositoryUrls=${labelDetail.skippedInvalidRepositoryUrls}`,
      );

      if (discovered.size >= this.config.githubDiscoveryMaxRepositories) {
        break;
      }
    }

    let seededRepos = 0;
    let createdIssues = 0;
    let skippedPullRequests = 0;
    let failedRepositories = 0;
    for (const repo of discovered.values()) {
      if (this.isGithubQuotaLow("core")) {
        details.warnings.push(
          "Stopped repository seeding because core quota is low",
        );
        this.logger.warn(
          `Stopping GitHub repository seeding because core quota is low remaining=${this.githubQuotaRemaining("core")}`,
        );
        break;
      }

      try {
        const result = await this.seedRepo(repo.owner, repo.name);
        if (result.insertedRepo) seededRepos += 1;
        createdIssues += result.crawl?.createdIssues ?? 0;
        skippedPullRequests += result.crawl?.skippedPullRequests ?? 0;
        details.repositories.push({
          owner: repo.owner,
          name: repo.name,
          action: this.seedAction(result),
          eligible: result.repoEligible,
          createdIssues: result.crawl?.createdIssues ?? 0,
          skippedPullRequests: result.crawl?.skippedPullRequests ?? 0,
        });
      } catch (error) {
        if (error instanceof GitHubRateLimitError) throw error;

        failedRepositories += 1;
        details.repositories.push({
          owner: repo.owner,
          name: repo.name,
          action: "failed",
          error: this.errorMessage(error),
          statusCode:
            error instanceof GitHubHttpError ? error.statusCode : undefined,
        });
        this.logger.warn(
          `Skipping GitHub repository ${repo.owner}/${repo.name} after ingestion error=${this.errorMessage(error)}`,
        );
      }
    }

    const recrawl = await this.recrawlKnownRepositories(details);
    failedRepositories += recrawl.failedRepositories;
    this.logger.log(
      `GitHub discovery completed discoveredRepos=${discovered.size} seededRepos=${seededRepos} recrawledRepos=${recrawl.recrawledRepos} failedRepositories=${failedRepositories}`,
    );

    return {
      searchedLabels: [...this.discoveryLabels],
      discoveredRepos: discovered.size,
      seededRepos,
      recrawledRepos: recrawl.recrawledRepos,
      createdIssues: createdIssues + recrawl.createdIssues,
      skippedPullRequests: skippedPullRequests + recrawl.skippedPullRequests,
      failedRepositories,
      details,
    };
  }

  /** Fetches open GitHub issues for a repository and stores qualifying ones. */
  async crawlRepo(repoId: string): Promise<GitHubCrawlResult> {
    const [repo] = await this.db
      .select()
      .from(repos)
      .where(eq(repos.id, repoId))
      .limit(1);
    if (!repo) throw new Error("Repo not found");
    this.logger.log(`Crawling GitHub issues for ${repo.owner}/${repo.name}`);

    const issuePages = await this.githubRequestPaginated<GitHubIssueResponse[]>(
      `/repos/${repo.owner}/${repo.name}/issues?state=open&labels=bug,good%20first%20issue,help%20wanted&per_page=100`,
    );

    const result: GitHubCrawlResult = {
      fetchedIssues: 0,
      createdIssues: 0,
      skippedPullRequests: 0,
      skippedExistingIssues: 0,
      skippedLowScoreIssues: 0,
    };

    for (const item of issuePages.flat()) {
      result.fetchedIssues += 1;

      if (item.pull_request) {
        result.skippedPullRequests += 1;
        continue;
      }

      const [existing] = await this.db
        .select()
        .from(issues)
        .where(eq(issues.githubId, item.id))
        .limit(1);
      if (existing) {
        result.skippedExistingIssues += 1;
        continue;
      }

      const labels = (item.labels ?? [])
        .map((label) => label.name)
        .filter(Boolean)
        .join(",");
      const candidate: Pick<Issue, "labels" | "body"> = {
        labels,
        body: item.body ?? null,
      };
      const score = this.scoringService.scoreIssue(candidate);

      if (score >= this.config.issueMinScore) {
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
        result.createdIssues += 1;
      } else {
        result.skippedLowScoreIssues += 1;
      }
    }

    await this.db
      .update(repos)
      .set({ lastCrawledAt: new Date() })
      .where(eq(repos.id, repo.id));

    this.logger.log(
      `Crawled GitHub issues for ${repo.owner}/${repo.name} fetchedIssues=${result.fetchedIssues} createdIssues=${result.createdIssues} skippedPullRequests=${result.skippedPullRequests} skippedExistingIssues=${result.skippedExistingIssues} skippedLowScoreIssues=${result.skippedLowScoreIssues}`,
    );
    return result;
  }

  private async recrawlKnownRepositories(
    details: GitHubIngestionDetails,
  ): Promise<{
    recrawledRepos: number;
    createdIssues: number;
    skippedPullRequests: number;
    failedRepositories: number;
  }> {
    const now = Date.now();
    const knownRepos = await this.db.select().from(repos);
    let recrawledRepos = 0;
    let createdIssues = 0;
    let skippedPullRequests = 0;
    let failedRepositories = 0;

    for (const repo of knownRepos) {
      if (!repo.eligible) continue;
      if (
        repo.lastCrawledAt &&
        now - repo.lastCrawledAt.getTime() < this.config.githubRecrawlAfterMs
      ) {
        continue;
      }
      if (this.isGithubQuotaLow("core")) {
        this.logger.warn(
          `Stopping GitHub recrawl because core quota is low remaining=${this.githubQuotaRemaining("core")}`,
        );
        break;
      }

      try {
        const result = await this.crawlRepo(repo.id);
        recrawledRepos += 1;
        createdIssues += result.createdIssues;
        skippedPullRequests += result.skippedPullRequests;
        details.repositories.push({
          owner: repo.owner,
          name: repo.name,
          action: "recrawled",
          eligible: repo.eligible,
          createdIssues: result.createdIssues,
          skippedPullRequests: result.skippedPullRequests,
        });
      } catch (error) {
        if (error instanceof GitHubRateLimitError) throw error;

        failedRepositories += 1;
        details.repositories.push({
          owner: repo.owner,
          name: repo.name,
          action: "recrawl_failed",
          eligible: repo.eligible,
          error: this.errorMessage(error),
          statusCode:
            error instanceof GitHubHttpError ? error.statusCode : undefined,
        });
        if (this.isRepositoryGone(error)) {
          await this.db
            .update(repos)
            .set({ eligible: false, lastCrawledAt: new Date() })
            .where(eq(repos.id, repo.id));
        }
        this.logger.warn(
          `Skipping GitHub recrawl for ${repo.owner}/${repo.name} after error=${this.errorMessage(error)}`,
        );
      }
    }

    this.logger.log(
      `GitHub recrawl completed eligibleReposChecked=${knownRepos.length} recrawledRepos=${recrawledRepos} createdIssues=${createdIssues} failedRepositories=${failedRepositories}`,
    );
    return {
      recrawledRepos,
      createdIssues,
      skippedPullRequests,
      failedRepositories,
    };
  }

  /** Performs an authenticated GitHub API request and returns typed JSON. */
  private async githubRequest<T>(path: string): Promise<T> {
    return (await this.githubRequestWithHeaders<T>(path)).data;
  }

  /** Follows GitHub REST pagination links until no next page remains. */
  private async githubRequestPaginated<T>(
    path: string,
    options: GitHubPageOptions = {},
  ): Promise<T[]> {
    const pages: T[] = [];
    let nextPathOrUrl: string | null = path;

    while (nextPathOrUrl) {
      const response = await this.githubRequestWithHeaders<T>(nextPathOrUrl);
      pages.push(response.data);
      if (options.maxPages && pages.length >= options.maxPages) {
        const nextPage = this.extractNextPage(response.linkHeader);
        if (nextPage) {
          this.logger.log(
            `Stopping GitHub pagination at maxPages=${options.maxPages} path=${this.redactUrl(path)}`,
          );
        }
        break;
      }
      if (this.isGithubQuotaLow(response.rateLimitResource)) {
        this.logger.warn(
          `Stopping GitHub pagination because ${response.rateLimitResource} quota is low remaining=${this.githubQuotaRemaining(response.rateLimitResource)} path=${this.redactUrl(path)}`,
        );
        break;
      }
      nextPathOrUrl = this.extractNextPage(response.linkHeader);
    }

    return pages;
  }

  private async githubRequestWithHeaders<T>(
    pathOrUrl: string,
  ): Promise<GitHubResponseWithHeaders<T>> {
    for (
      let attempt = 0;
      attempt <= this.config.githubMaxRetries;
      attempt += 1
    ) {
      let response: Response;
      try {
        response = await fetch(this.githubUrl(pathOrUrl), {
          headers: {
            Authorization: `Bearer ${this.config.githubToken}`,
            Accept: "application/vnd.github.v3+json",
            "User-Agent": "prompt-for-good-hub",
          },
        });
      } catch (error) {
        if (attempt < this.config.githubMaxRetries) {
          await this.backoffAfterNetworkError(attempt, error);
          continue;
        }

        throw new GitHubNetworkError(this.errorMessage(error));
      }

      const rateLimitResource = this.recordGitHubRateLimit(pathOrUrl, response);

      if (response.ok) {
        const rateLimitRemaining =
          this.rateLimitRemainingByResource.get(rateLimitResource);
        if (
          rateLimitRemaining !== undefined &&
          rateLimitRemaining <= this.config.githubMinRateLimitRemaining
        ) {
          this.logger.warn(
            `GitHub API quota running low remaining=${rateLimitRemaining} path=${this.redactUrl(pathOrUrl)}`,
          );
        }
        return {
          data: (await response.json()) as T,
          linkHeader: response.headers?.get("link") ?? null,
          rateLimitResource,
        };
      }

      if (this.isPrimaryRateLimited(response)) {
        const resetAt = this.rateLimitResetAtByResource.get(rateLimitResource);
        this.logger.warn(
          `GitHub API rate limit reached status=${response.status} resource=${rateLimitResource} resetAt=${resetAt ?? "unknown"} path=${this.redactUrl(pathOrUrl)}`,
        );
        throw new GitHubRateLimitError(
          `GitHub API rate-limited with ${response.status}`,
        );
      }

      if (
        attempt < this.config.githubMaxRetries &&
        this.isRetryableResponse(response)
      ) {
        await this.backoff(attempt, response);
        continue;
      }

      throw new GitHubHttpError(
        response.status,
        `GitHub API request failed with ${response.status}`,
      );
    }

    throw new GitHubHttpError(0, "GitHub API request failed");
  }

  private githubUrl(pathOrUrl: string): string {
    if (pathOrUrl.startsWith("https://")) return pathOrUrl;
    return `${this.apiBaseUrl}${pathOrUrl}`;
  }

  private redactUrl(pathOrUrl: string): string {
    try {
      const url = new URL(this.githubUrl(pathOrUrl));
      return `${url.origin}${url.pathname}`;
    } catch {
      return pathOrUrl.split("?")[0] ?? pathOrUrl;
    }
  }

  private extractNextPage(linkHeader: string | null): string | null {
    if (!linkHeader) return null;

    for (const part of linkHeader.split(",")) {
      const match = part.match(/<([^>]+)>;\s*rel="next"/);
      if (match) return match[1];
    }

    return null;
  }

  private isPrimaryRateLimited(response: Response): boolean {
    return (
      (response.status === 403 || response.status === 429) &&
      response.headers?.get("x-ratelimit-remaining") === "0"
    );
  }

  private isGithubQuotaLow(resource: GitHubRateLimitResource): boolean {
    const remaining = this.rateLimitRemainingByResource.get(resource);
    return (
      remaining !== undefined &&
      remaining <= this.config.githubMinRateLimitRemaining
    );
  }

  private githubQuotaRemaining(
    resource: GitHubRateLimitResource,
  ): number | "unknown" {
    return this.rateLimitRemainingByResource.get(resource) ?? "unknown";
  }

  private githubRateLimitSnapshots(): GitHubRateLimitSnapshot[] {
    const resources = new Set<GitHubRateLimitResource>([
      ...this.rateLimitRemainingByResource.keys(),
      ...this.rateLimitResetAtByResource.keys(),
    ]);

    return [...resources].map((resource) => ({
      resource,
      remaining: this.githubQuotaRemaining(resource),
      resetAt: this.rateLimitResetAtByResource.get(resource),
    }));
  }

  private recordGitHubRateLimit(
    pathOrUrl: string,
    response: Response,
  ): GitHubRateLimitResource {
    const rateLimitResource = this.githubRateLimitResource(pathOrUrl, response);
    const rateLimitRemaining = response.headers?.get("x-ratelimit-remaining");
    if (rateLimitRemaining !== null) {
      const parsedRemaining = Number(rateLimitRemaining);
      if (Number.isFinite(parsedRemaining)) {
        this.rateLimitRemainingByResource.set(
          rateLimitResource,
          parsedRemaining,
        );
      }
    }

    const rateLimitReset = Number(response.headers?.get("x-ratelimit-reset"));
    if (Number.isFinite(rateLimitReset) && rateLimitReset > 0) {
      this.rateLimitResetAtByResource.set(
        rateLimitResource,
        new Date(rateLimitReset * 1000).toISOString(),
      );
    }

    return rateLimitResource;
  }

  private githubRateLimitResource(
    pathOrUrl: string,
    response: Response,
  ): GitHubRateLimitResource {
    const resource = response.headers?.get("x-ratelimit-resource");
    if (resource) return resource;

    const url = new URL(this.githubUrl(pathOrUrl));
    return url.pathname.startsWith("/search/") ? "search" : "core";
  }

  private isRetryableResponse(response: Response): boolean {
    return (
      [429, 500, 502, 503, 504].includes(response.status) ||
      this.isSecondaryRateLimit(response)
    );
  }

  private isSecondaryRateLimit(response: Response): boolean {
    return (
      response.status === 403 &&
      response.headers?.get("x-ratelimit-remaining") !== "0" &&
      response.headers?.get("retry-after") !== null
    );
  }

  private async backoff(attempt: number, response: Response): Promise<void> {
    const delayMs = this.backoffDelayMs(attempt, response);

    this.logger.warn(
      `Retrying GitHub request after ${delayMs}ms following ${response.status}`,
    );
    await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
  }

  private async backoffAfterNetworkError(
    attempt: number,
    error: unknown,
  ): Promise<void> {
    const delayMs = this.exponentialBackoffWithJitterMs(attempt);

    this.logger.warn(
      `Retrying GitHub request after ${delayMs}ms following network error=${this.errorMessage(error)}`,
    );
    await new Promise((resolve) => globalThis.setTimeout(resolve, delayMs));
  }

  private backoffDelayMs(attempt: number, response: Response): number {
    const retryAfter = Number(response.headers?.get("retry-after") ?? 0);
    if (Number.isFinite(retryAfter) && retryAfter > 0) {
      return retryAfter * 1000;
    }

    const rateLimitReset = Number(response.headers?.get("x-ratelimit-reset"));
    if (
      response.headers?.get("x-ratelimit-remaining") === "0" &&
      Number.isFinite(rateLimitReset) &&
      rateLimitReset > 0
    ) {
      return Math.max(rateLimitReset * 1000 - Date.now(), 0);
    }

    return this.exponentialBackoffWithJitterMs(attempt);
  }

  private exponentialBackoffWithJitterMs(attempt: number): number {
    const baseDelayMs = this.config.githubBackoffBaseMs;
    const exponentialDelayMs = baseDelayMs * 2 ** attempt;
    const jitterCeilingMs = Math.max(1, Math.min(baseDelayMs, 250));
    return exponentialDelayMs + Math.floor(Math.random() * jitterCeilingMs);
  }

  private createIngestionDetails(): GitHubIngestionDetails {
    return {
      labels: [],
      repositories: [],
      warnings: [],
      rateLimits: [],
    };
  }

  private seedAction(
    result: Awaited<ReturnType<GitHubService["seedRepo"]>>,
  ): GitHubIngestionRepositoryDetail["action"] {
    if (!result.insertedRepo) return "existing";
    return result.repoEligible ? "seeded" : "ineligible";
  }

  private isRepositoryGone(error: unknown): boolean {
    return (
      error instanceof GitHubHttpError &&
      [404, 410, 451].includes(error.statusCode)
    );
  }

  private errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
  }

  private canonicalRepository(
    owner: string,
    name: string,
    repoData: GitHubRepoResponse,
  ): { owner: string; name: string } {
    const [canonicalOwner, canonicalName] =
      repoData.full_name?.split("/") ?? [];
    if (canonicalOwner && canonicalName) {
      return { owner: canonicalOwner, name: canonicalName };
    }

    return { owner, name };
  }

  private parseRepositoryApiUrl(
    repositoryUrl: string | undefined,
  ): { owner: string; name: string } | null {
    if (!repositoryUrl) return null;

    try {
      const url = new URL(repositoryUrl);
      const [, reposPath, owner, name] = url.pathname.split("/");
      if (url.hostname !== "api.github.com" || reposPath !== "repos") {
        return null;
      }
      if (!owner || !name) return null;
      return { owner, name };
    } catch {
      return null;
    }
  }
}

type GitHubCrawlResult = {
  fetchedIssues: number;
  createdIssues: number;
  skippedPullRequests: number;
  skippedExistingIssues: number;
  skippedLowScoreIssues: number;
};

class GitHubRateLimitError extends Error {}

class GitHubHttpError extends Error {
  constructor(
    readonly statusCode: number,
    message: string,
  ) {
    super(message);
  }
}

class GitHubNetworkError extends Error {}
