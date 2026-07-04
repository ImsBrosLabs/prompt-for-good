import { Controller, Get, Inject } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { StatsResponseDto } from "../openapi/dtos";
import { StatsService } from "./stats.service";

@Controller("stats")
@ApiTags("Stats")
export class StatsController {
  constructor(
    @Inject(StatsService) private readonly statsService: StatsService,
  ) {}

  @Get()
  @ApiOperation({
    summary: "Get platform statistics",
    description:
      "Returns aggregated counts for repositories, issues and runners across the platform.",
  })
  @ApiOkResponse({
    description: "Current platform statistics",
    type: StatsResponseDto,
  })
  async getStats(): Promise<StatsResponseDto> {
    return this.statsService.getStats();
  }
}
