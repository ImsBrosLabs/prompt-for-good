import { Module } from "@nestjs/common";
import { AdminModule } from "./admin/admin.module";
import { AppConfigModule } from "./config";
import { DatabaseModule } from "./db/database.module";
import { RuntimeConfigModule } from "./runtime-config/runtime-config.module";

@Module({
  imports: [AppConfigModule, DatabaseModule, RuntimeConfigModule, AdminModule],
})
export class AppModule {}
