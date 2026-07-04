import { Module } from "@nestjs/common";
import { GitHubModule } from "../github/github.module";
import { SeedController } from "./seed.controller";

@Module({
  imports: [GitHubModule],
  controllers: [SeedController],
})
export class SeedModule {}
