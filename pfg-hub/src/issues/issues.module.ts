import { Module } from "@nestjs/common";
import { RunnersModule } from "../runners/runners.module";
import { IssuesController } from "./issues.controller";
import { IssuesService } from "./issues.service";

@Module({
  imports: [RunnersModule],
  controllers: [IssuesController],
  providers: [IssuesService],
  exports: [IssuesService],
})
export class IssuesModule {}
