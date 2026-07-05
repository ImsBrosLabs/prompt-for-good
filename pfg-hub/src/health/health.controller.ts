import { Controller, Get } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiTags } from "@nestjs/swagger";
import { HealthResponseDto } from "../openapi/dtos";

@Controller("actuator")
@ApiTags("Health")
export class HealthController {
  @Get("health")
  @ApiOperation({ summary: "Get service health" })
  @ApiOkResponse({ type: HealthResponseDto })
  /** Reports whether the hub process is reachable. */
  health() {
    return { status: "UP" };
  }
}
