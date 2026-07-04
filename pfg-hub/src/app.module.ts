import { Module } from "@nestjs/common";
import { DatabaseModule } from "./db/database.module";
import { GitHubModule } from "./github/github.module";
import { HealthController } from "./health/health.controller";
import { IssuesModule } from "./issues/issues.module";
import { OpenApiController } from "./openapi/openapi.controller";
import { RunnersModule } from "./runners/runners.module";
import { ScoringModule } from "./scoring/scoring.module";
import { SeedModule } from "./seed/seed.module";
import { StatsModule } from "./stats/stats.module";

@Module({
  imports: [
    DatabaseModule,
    ScoringModule,
    RunnersModule,
    IssuesModule,
    StatsModule,
    GitHubModule,
    SeedModule,
  ],
  controllers: [HealthController, OpenApiController],
})
export class AppModule {}
