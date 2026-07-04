import {
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Post,
  Query,
  UseGuards,
} from "@nestjs/common";
import { AdminTokenGuard } from "../auth/admin-token.guard";
import { GitHubService } from "../github/github.service";

@Controller("seed")
@UseGuards(AdminTokenGuard)
export class SeedController {
  constructor(
    @Inject(GitHubService) private readonly githubService: GitHubService,
  ) {}

  @Post("repo")
  @HttpCode(HttpStatus.OK)
  async seedRepo(
    @Query("owner") owner: string,
    @Query("name") name: string,
  ): Promise<void> {
    await this.githubService.seedRepo(owner, name);
  }

  @Post("default")
  @HttpCode(HttpStatus.OK)
  async seedDefault(): Promise<void> {
    await this.githubService.seedRepo("nodejs", "node");
    await this.githubService.seedRepo("psf", "requests");
    await this.githubService.seedRepo("scikit-learn", "scikit-learn");
  }
}
