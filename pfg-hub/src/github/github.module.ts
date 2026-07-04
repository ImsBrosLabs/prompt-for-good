import { Module } from "@nestjs/common";
import { ScoringModule } from "../scoring/scoring.module";
import { GitHubService } from "./github.service";

@Module({
  imports: [ScoringModule],
  providers: [GitHubService],
  exports: [GitHubService],
})
export class GitHubModule {}
