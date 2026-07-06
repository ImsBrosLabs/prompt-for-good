import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import {
  ApiOkResponse,
  ApiOperation,
  ApiQuery,
  ApiResponse,
  ApiSecurity,
  ApiTags,
} from "@nestjs/swagger";
import { AdminTokenGuard } from "../auth/admin-token.guard";
import { GitHubDiscoveryResult, GitHubService } from "../github/github.service";

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
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Discover repositories from GitHub issues",
    description:
      "Searches GitHub for open good-first-issue/help-wanted issues, discovers their repositories, and seeds qualifying repositories. Requires a valid X-Admin-Token header.",
  })
  @ApiOkResponse({ description: "Repository discovery completed" })
  @ApiResponse({ status: 401, description: "Missing or invalid X-Admin-Token" })
  @ApiResponse({
    status: 502,
    description: "GitHub API unreachable or rate-limited",
  })
  /** Discovers candidate repositories from GitHub issue search. */
  async discoverRepos(): Promise<GitHubDiscoveryResult & { runId: string }> {
    return this.githubService.runIngestion();
  }
}
