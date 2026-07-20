import { Controller, Get, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { AdminTokenGuard } from "../auth/admin-token.guard";
import { RuntimeConfigSnapshotDto } from "../openapi/dtos";
import { RuntimeConfigService } from "./runtime-config.service";

@Controller("configuration")
@ApiTags("Runner configuration")
@ApiSecurity("AdminToken")
@UseGuards(AdminTokenGuard)
export class RuntimeConfigController {
  constructor(private readonly runtimeConfigService: RuntimeConfigService) {}

  @Get("snapshot")
  @ApiOkResponse({
    description: "Returns effective runner configuration for one execution snapshot",
    type: RuntimeConfigSnapshotDto,
  })
  async snapshot(): Promise<RuntimeConfigSnapshotDto> {
    return { values: await this.runtimeConfigService.runnerSnapshot() };
  }
}
