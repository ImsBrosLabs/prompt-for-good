import "reflect-metadata";
import { describe, expect, it, vi, afterEach } from "vitest";
import { GitHubService } from "../src/github/github.service";
import {
  RuntimeConfigChange,
  RuntimeConfigService,
} from "../src/runtime-config/runtime-config.service";

type TestRuntimeConfig = {
  issueMaxRetries: number;
  issueMinScore: number;
  githubToken: string;
  githubIngestionEnabled: boolean;
  githubIngestionCron: string;
  githubRecrawlAfterMs: number;
  githubMaxRetries: number;
  githubBackoffBaseMs: number;
  githubDiscoveryMaxPagesPerLabel: number;
  githubDiscoveryMaxRepositories: number;
  githubMinRateLimitRemaining: number;
};

const baseRuntimeConfig: TestRuntimeConfig = {
  issueMaxRetries: 3,
  issueMinScore: 60,
  githubToken: "test-token",
  githubIngestionEnabled: false,
  githubIngestionCron: "0 */6 * * *",
  githubRecrawlAfterMs: 6 * 60 * 60 * 1000,
  githubMaxRetries: 0,
  githubBackoffBaseMs: 1,
  githubDiscoveryMaxPagesPerLabel: 2,
  githubDiscoveryMaxRepositories: 3,
  githubMinRateLimitRemaining: 5,
};

describe("GitHubService discovery limits", () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("caps issue search pagination and repository discovery", async () => {
    const service = createService();
    const seedRepo = vi.spyOn(service, "seedRepo").mockResolvedValue({
      insertedRepo: true,
      repoEligible: false,
      crawl: null,
    });
    vi.spyOn(service as never, "recrawlKnownRepositories").mockResolvedValue({
      recrawledRepos: 0,
      createdIssues: 0,
      skippedPullRequests: 0,
      failedRepositories: 0,
    });
    const fetchMock = vi.fn(async (url: string | URL | Request) => {
      const requestUrl = new URL(String(url));
      const page = Number(requestUrl.searchParams.get("page") ?? 1);

      return jsonResponse(
        {
          items: [
            {
              repository_url: `https://api.github.com/repos/acme/project-${page}-a`,
            },
            {
              repository_url: `https://api.github.com/repos/acme/project-${page}-b`,
            },
          ],
        },
        {
          link:
            page < 3
              ? `<https://api.github.com/search/issues?page=${page + 1}>; rel="next"`
              : undefined,
          "x-ratelimit-remaining": "100",
        },
      );
    });
    vi.stubGlobal("fetch", fetchMock);

    const result = await service.discoverRepositories();

    expect(result).toMatchObject({
      discoveredRepos: 3,
      seededRepos: 3,
      recrawledRepos: 0,
      failedRepositories: 0,
    });
    expect(result.details.labels[0]).toMatchObject({
      label: "good first issue",
      pages: 2,
      repositoryHits: 3,
      stoppedReason: "repository_limit",
    });
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(seedRepo).toHaveBeenCalledTimes(3);
    expect(
      seedRepo.mock.calls.map(([owner, name]) => `${owner}/${name}`),
    ).toEqual(["acme/project-1-a", "acme/project-1-b", "acme/project-2-a"]);
  });

  it("stops search pagination when GitHub reports low search quota", async () => {
    const service = createService({
      githubDiscoveryMaxPagesPerLabel: 10,
      githubDiscoveryMaxRepositories: 10,
    });
    const seedRepo = vi.spyOn(service, "seedRepo").mockResolvedValue({
      insertedRepo: true,
      repoEligible: false,
      crawl: null,
    });
    vi.spyOn(service as never, "recrawlKnownRepositories").mockResolvedValue({
      recrawledRepos: 0,
      createdIssues: 0,
      skippedPullRequests: 0,
      failedRepositories: 0,
    });
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          items: [
            {
              repository_url: "https://api.github.com/repos/acme/project",
            },
          ],
        },
        {
          link: '<https://api.github.com/search/issues?page=2>; rel="next"',
          "x-ratelimit-remaining": "5",
        },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const result = await service.discoverRepositories();

    expect(result).toMatchObject({
      discoveredRepos: 1,
      seededRepos: 1,
      recrawledRepos: 0,
      failedRepositories: 0,
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seedRepo).toHaveBeenCalledWith("acme", "project");
  });

  it("continues repository discovery when one repository seed fails", async () => {
    const service = createService({
      githubDiscoveryMaxRepositories: 10,
    });
    const seedRepo = vi
      .spyOn(service, "seedRepo")
      .mockImplementation(async (owner: string, name: string) => {
        if (name === "broken") throw new Error("GitHub API request failed");
        return {
          insertedRepo: true,
          repoEligible: true,
          crawl: {
            fetchedIssues: 1,
            createdIssues: 1,
            skippedPullRequests: 0,
            skippedExistingIssues: 0,
            skippedLowScoreIssues: 0,
          },
        };
      });
    vi.spyOn(service as never, "recrawlKnownRepositories").mockResolvedValue({
      recrawledRepos: 0,
      createdIssues: 0,
      skippedPullRequests: 0,
      failedRepositories: 0,
    });
    vi.stubGlobal(
      "fetch",
      vi.fn(async () =>
        jsonResponse(
          {
            items: [
              {
                repository_url: "https://api.github.com/repos/acme/broken",
              },
              {
                repository_url: "https://api.github.com/repos/acme/healthy",
              },
            ],
          },
          { "x-ratelimit-remaining": "100" },
        ),
      ),
    );

    const result = await service.discoverRepositories();

    expect(result).toMatchObject({
      discoveredRepos: 2,
      seededRepos: 1,
      createdIssues: 1,
      failedRepositories: 1,
    });
    expect(seedRepo).toHaveBeenCalledTimes(2);
    expect(result.details.repositories).toEqual(
      expect.arrayContaining([
        expect.objectContaining({
          owner: "acme",
          name: "broken",
          action: "failed",
          error: "GitHub API request failed",
        }),
        expect.objectContaining({
          owner: "acme",
          name: "healthy",
          action: "seeded",
          createdIssues: 1,
        }),
      ]),
    );
  });

  it("uses retry-after before exponential backoff jitter", async () => {
    const service = createService();
    const delayMs = await callBackoffDelayMs(
      service,
      responseWithHeaders(403, {
        "retry-after": "2",
        "x-ratelimit-remaining": "10",
      }),
    );

    expect(delayMs).toBe(2000);
  });

  it("uses x-ratelimit-reset when primary quota is exhausted", async () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00Z"));
    const service = createService();
    const delayMs = await callBackoffDelayMs(
      service,
      responseWithHeaders(429, {
        "x-ratelimit-remaining": "0",
        "x-ratelimit-reset": String(
          new Date("2026-01-01T00:00:03Z").getTime() / 1000,
        ),
      }),
    );

    expect(delayMs).toBe(3000);
  });

  it("detects CI, tests and supported ecosystems from the repository tree", async () => {
    const service = createService({ githubToken: "runtime-token" });
    const fetchMock = vi.fn(async () =>
      jsonResponse(
        {
          tree: [
            { path: ".github/workflows/checks.yml", type: "blob" },
            { path: "src/widget.spec.ts", type: "blob" },
            { path: "package.json", type: "blob" },
            { path: "pyproject.toml", type: "blob" },
          ],
        },
        { "x-ratelimit-remaining": "100" },
      ),
    );
    vi.stubGlobal("fetch", fetchMock);

    const signals = await callInspectRepository(
      service,
      "acme",
      "project",
      "main",
    );

    expect(signals).toEqual({
      ciDetected: true,
      testsDetected: true,
      ecosystems: ["npm", "pip"],
    });
    expect(fetchMock).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          Authorization: "Bearer runtime-token",
        }),
      }),
    );
  });

  it("reconfigures the ingestion cron when admin runtime values change", async () => {
    const runtimeConfig = { ...baseRuntimeConfig };
    let listener:
      ((change: RuntimeConfigChange) => void | Promise<void>) | undefined;
    const runtimeConfigService = {
      get: vi.fn(async (key: keyof TestRuntimeConfig) => runtimeConfig[key]),
      onChange: vi.fn(
        (
          registeredListener: (
            change: RuntimeConfigChange,
          ) => void | Promise<void>,
        ) => {
          listener = registeredListener;
          return vi.fn();
        },
      ),
    } as unknown as RuntimeConfigService;
    const jobs = new Map<string, { stop: () => void }>();
    const schedulerRegistry = {
      addCronJob: vi.fn((name: string, job: { stop: () => void }) => {
        jobs.set(name, job);
      }),
      getCronJob: vi.fn((name: string) => {
        const job = jobs.get(name);
        if (!job) throw new Error("Missing cron job");
        return job;
      }),
      deleteCronJob: vi.fn((name: string) => {
        jobs.delete(name);
      }),
    };
    const service = new GitHubService(
      {} as never,
      {} as never,
      runtimeConfigService,
      schedulerRegistry as never,
    );

    await service.onApplicationBootstrap();
    expect(schedulerRegistry.addCronJob).not.toHaveBeenCalled();

    runtimeConfig.githubIngestionEnabled = true;
    await listener?.({ key: "githubIngestionEnabled", operation: "set" });
    expect(schedulerRegistry.addCronJob).toHaveBeenCalledTimes(1);

    runtimeConfig.githubIngestionCron = "0 */2 * * *";
    await listener?.({ key: "githubIngestionCron", operation: "set" });
    expect(schedulerRegistry.deleteCronJob).toHaveBeenCalledWith(
      "github-ingestion",
    );
    expect(schedulerRegistry.addCronJob).toHaveBeenCalledTimes(2);

    service.onApplicationShutdown();
  });
});

function createService(config: Partial<TestRuntimeConfig> = {}): GitHubService {
  const runtimeConfig = { ...baseRuntimeConfig, ...config };
  const runtimeConfigService = {
    get: vi.fn(async (key: keyof TestRuntimeConfig) => runtimeConfig[key]),
  } as unknown as RuntimeConfigService;

  return new GitHubService(
    {} as never,
    {} as never,
    runtimeConfigService,
    {} as never,
  );
}

function callInspectRepository(
  service: GitHubService,
  owner: string,
  name: string,
  branch: string,
) {
  return (
    service as unknown as {
      inspectRepository: (
        owner: string,
        name: string,
        branch: string,
      ) => Promise<{
        ciDetected: boolean;
        testsDetected: boolean;
        ecosystems: string[];
      }>;
    }
  ).inspectRepository(owner, name, branch);
}

function jsonResponse(
  body: unknown,
  headers: Record<string, string | undefined> = {},
): Response {
  return {
    ok: true,
    status: 200,
    headers: {
      get(name: string): string | null {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    json: async () => body,
  } as Response;
}

function responseWithHeaders(
  status: number,
  headers: Record<string, string | undefined>,
): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    headers: {
      get(name: string): string | null {
        return headers[name.toLowerCase()] ?? null;
      },
    },
    json: async () => ({}),
  } as Response;
}

function callBackoffDelayMs(
  service: GitHubService,
  response: Response,
): Promise<number> {
  return (
    service as unknown as {
      backoffDelayMs(attempt: number, response: Response): Promise<number>;
    }
  ).backoffDelayMs(0, response);
}
