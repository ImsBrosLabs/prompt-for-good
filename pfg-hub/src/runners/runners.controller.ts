import {
  Body,
  Controller,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
} from "@nestjs/common";
import {
  ApiBody,
  ApiNoContentResponse,
  ApiNotFoundResponse,
  ApiOkResponse,
  ApiOperation,
  ApiParam,
  ApiResponse,
  ApiSecurity,
  ApiTags,
  ApiUnauthorizedResponse,
} from "@nestjs/swagger";
import { getHeader, RequestWithHeaders } from "../auth/request-headers";
import {
  HeartbeatRequestDto,
  RegisterRequestDto,
  RegisterResponseDto,
} from "../openapi/dtos";
import { RunnersService } from "./runners.service";

@Controller("runners")
@ApiTags("Runners")
export class RunnersController {
  constructor(
    @Inject(RunnersService) private readonly runnersService: RunnersService,
  ) {}

  @Post("register")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Register a new runner",
    description:
      "Creates a runner entry and returns a permanent authentication token.",
  })
  @ApiBody({ type: RegisterRequestDto })
  @ApiOkResponse({
    description: "Runner registered successfully",
    type: RegisterResponseDto,
  })
  @ApiResponse({
    status: 400,
    description: "Missing or invalid contributor name",
  })
  async registerRunner(
    @Body() request: RegisterRequestDto,
  ): Promise<RegisterResponseDto> {
    const runner = await this.runnersService.register(request.contributorName);
    return { runnerId: runner.id, token: runner.token };
  }

  @Post(":id/heartbeat")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Send a heartbeat",
    description:
      "Signals the runner is alive and updates its remaining daily token quota. Must be called at least every 30 minutes to stay marked as active.",
  })
  @ApiSecurity("RunnerToken")
  @ApiParam({ name: "id", description: "Runner UUID" })
  @ApiBody({ type: HeartbeatRequestDto })
  @ApiNoContentResponse({ description: "Heartbeat recorded" })
  @ApiUnauthorizedResponse({ description: "Invalid or missing runner token" })
  @ApiNotFoundResponse({ description: "Runner not found" })
  async heartbeat(
    @Param("id") id: string,
    @Req() request: RequestWithHeaders,
    @Body() body: HeartbeatRequestDto,
  ): Promise<void> {
    const runnerToken = getHeader(request, "x-runner-token");
    await this.runnersService.heartbeat(
      id,
      runnerToken,
      body.quotaRemainingToday,
    );
  }
}
