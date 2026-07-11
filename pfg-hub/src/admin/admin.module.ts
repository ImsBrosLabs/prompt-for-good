import { Module } from "@nestjs/common";
import { AdminTokenGuard } from "../auth/admin-token.guard";
import { AdminController } from "./admin.controller";
import { AdminService } from "./admin.service";

@Module({
  controllers: [AdminController],
  providers: [AdminService, AdminTokenGuard],
})
export class AdminModule {}
