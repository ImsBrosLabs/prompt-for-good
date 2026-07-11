import { Module } from "@nestjs/common";
import { DispatchMetricsModule } from "../dispatch-metrics/dispatch-metrics.module";
import { StatsController } from "./stats.controller";
import { StatsService } from "./stats.service";

@Module({
  imports: [DispatchMetricsModule],
  controllers: [StatsController],
  providers: [StatsService],
})
export class StatsModule {}
