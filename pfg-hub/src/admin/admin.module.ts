import { Module } from "@nestjs/common";
import { AdminTokenGuard } from "../auth/admin-token.guard";
import { DispatchMetricsModule } from "../dispatch-metrics/dispatch-metrics.module";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  imports: [DispatchMetricsModule],
  controllers: [AdminController],
  providers: [AdminService, AdminTokenGuard],
})
export class AdminModule {}
