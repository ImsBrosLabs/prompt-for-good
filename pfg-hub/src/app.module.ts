import { Module } from "@nestjs/common";
import { ScheduleModule } from "@nestjs/schedule";
import { AdminModule } from "./admin/admin.module";
import { AppConfigModule } from "./config";
import { DatabaseModule } from "./db/database.module";
import { GitHubModule } from "./github/github.module";
import { HealthController } from "./health/health.controller";
import { IssuesModule } from "./issues/issues.module";
import { RuntimeConfigModule } from "./runtime-config/runtime-config.module";
import { RunnersModule } from "./runners/runners.module";
import { ScoringModule } from "./scoring/scoring.module";
import { SeedModule } from "./seed/seed.module";
import { StatsModule } from "./stats/stats.module";

@Module({
  imports: [
    AppConfigModule,
    RuntimeConfigModule,
    AdminModule,
    ScheduleModule.forRoot(),
    DatabaseModule,
    ScoringModule,
    RunnersModule,
    IssuesModule,
    StatsModule,
    GitHubModule,
    SeedModule,
  ],
  controllers: [HealthController],
})
export class AppModule {}
