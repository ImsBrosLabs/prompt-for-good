import "reflect-metadata";
import { describe, expect, it, vi, afterEach } from "vitest";
import { AppConfig } from "../src/config";
import { GitHubService } from "../src/github/github.service";

const baseConfig: AppConfig = {
  port: 8080,
  databaseUrl: "postgresql://pfg:pfg@localhost:5432/pfg",
  githubToken: "test-token",
  adminKey: "test-admin-key",
  issueMaxRetries: 3,
  issueMinScore: 60,
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
    const seedRepo = vi
      .spyOn(service, "seedRepo")
      .mockResolvedValue({
        insertedRepo: true,
        repoEligible: false,
        crawl: null,
      });
    vi.spyOn(service as never, "recrawlKnownRepositories").mockResolvedValue({
      recrawledRepos: 0,
      createdIssues: 0,
      skippedPullRequests: 0,
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
    });
    expect(fetchMock).toHaveBeenCalledTimes(1);
    expect(seedRepo).toHaveBeenCalledWith("acme", "project");
  });
});

function createService(config: Partial<AppConfig> = {}): GitHubService {
  return new GitHubService(
    {} as never,
    {} as never,
    { ...baseConfig, ...config },
    {} as never,
  );
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
