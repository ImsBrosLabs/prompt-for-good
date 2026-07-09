import {
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiAcceptedResponse,
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { GitHubDiscoveryQueuedDto, IngestionRunDto } from "../openapi/dtos";
import { AdminTokenGuard } from "../auth/admin-token.guard";
import { GitHubService } from "../github/github.service";

@Controller("seed")
@UseGuards(AdminTokenGuard)
@ApiTags("Seed")
@ApiSecurity("AdminToken")
export class SeedController {
  constructor(
    @Inject(GitHubService) private readonly githubService: GitHubService,
  ) {}

  @Post("repo")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Seed a single repository",
    description:
      "Fetches open issues from the given GitHub repository and adds qualifying ones to the scoring queue. Requires a valid X-Admin-Token header.",
  })
  @ApiQuery({
    name: "owner",
    required: true,
    example: "nodejs",
    description: "GitHub organisation or user login",
  })
  @ApiQuery({
    name: "name",
    required: true,
    example: "node",
    description: "Repository name",
  })
  @ApiOkResponse({ description: "Repository seeded successfully" })
  @ApiResponse({ status: 400, description: "Missing owner or name parameter" })
  @ApiResponse({ status: 401, description: "Missing or invalid X-Admin-Token" })
  @ApiResponse({
    status: 502,
    description: "GitHub API unreachable or rate-limited",
  })
  /** Seeds one requested repository into the issue queue. */
  async seedRepo(
    @Query("owner") owner: string,
    @Query("name") name: string,
  ): Promise<void> {
    await this.githubService.seedRepo(owner, name);
  }

  @Post("default")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Seed default repositories",
    description:
      "Seeds a curated list of well-known repositories (node, requests, scikit-learn). Requires a valid X-Admin-Token header.",
  })
  @ApiOkResponse({ description: "Default repositories seeded successfully" })
  @ApiResponse({ status: 401, description: "Missing or invalid X-Admin-Token" })
  /** Seeds the curated default repository list used for local/demo data. */
  async seedDefault(): Promise<void> {
    await this.githubService.seedRepo("nodejs", "node");
    await this.githubService.seedRepo("psf", "requests");
    await this.githubService.seedRepo("scikit-learn", "scikit-learn");
  }

  @Post("discover")
  @HttpCode(HttpStatus.ACCEPTED)
  @ApiOperation({
    summary: "Discover repositories from GitHub issues",
    description:
      "Queues a background search for open good-first-issue/help-wanted issues, discovers their repositories, and seeds qualifying repositories. Requires a valid X-Admin-Token header.",
  })
  @ApiAcceptedResponse({
    description: "Repository discovery queued",
    type: GitHubDiscoveryQueuedDto,
  })
  @ApiResponse({ status: 401, description: "Missing or invalid X-Admin-Token" })
  @ApiResponse({
    status: 502,
    description: "GitHub API unreachable or rate-limited",
  })
  /** Discovers candidate repositories from GitHub issue search. */
  async discoverRepos(): Promise<GitHubDiscoveryQueuedDto> {
    return this.githubService.enqueueIngestion();
  }

  @Get("ingestion-runs")
  @ApiOperation({
    summary: "List recent GitHub ingestion runs",
    description:
      "Returns recent scheduled or manual GitHub ingestion runs with counters, status, errors and structured diagnostic details. Requires a valid X-Admin-Token header.",
  })
  @ApiQuery({
    name: "limit",
    required: false,
    example: 20,
    description: "Maximum number of runs to return, clamped to 1-100",
  })
  @ApiOkResponse({
    description: "Recent ingestion runs",
    isArray: true,
    type: IngestionRunDto,
  })
  @ApiResponse({ status: 401, description: "Missing or invalid X-Admin-Token" })
  /** Lists recent GitHub ingestion audit runs. */
  async listIngestionRuns(
    @Query("limit") limit?: string,
  ): Promise<IngestionRunDto[]> {
    const runs = await this.githubService.listIngestionRuns(
      Number(limit ?? 20),
    );
    return runs.map((run) => ({
      ...run,
      startedAt: run.startedAt.toISOString(),
      finishedAt: run.finishedAt?.toISOString() ?? null,
    }));
  }
}
