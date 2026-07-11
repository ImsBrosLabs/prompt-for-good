import { Module } from "@nestjs/common";
import { DispatchMetricsService } from "./dispatch-metrics.service";

@Module({
  providers: [DispatchMetricsService],
  exports: [DispatchMetricsService],
})
export class DispatchMetricsModule {}
