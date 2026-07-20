import { Module } from "@nestjs/common";
import { RuntimeConfigModule } from "../runtime-config/runtime-config.module";
import { AdminController } from "./admin.controller";

@Module({
  imports: [RuntimeConfigModule],
  controllers: [AdminController],
})
export class AdminModule {}
