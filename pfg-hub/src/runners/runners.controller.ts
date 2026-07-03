import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
} from "@nestjs/common";
import { components } from "../types/openapi";
import { RunnersService } from "./runners.service";

type RegisterRequest = components["schemas"]["RegisterRequest"];
type RegisterResponse = components["schemas"]["RegisterResponse"];
type HeartbeatRequest = components["schemas"]["HeartbeatRequest"];

@Controller("runners")
export class RunnersController {
  constructor(private readonly runnersService: RunnersService) {}

  @Post("register")
  @HttpCode(HttpStatus.OK)
  async registerRunner(
    @Body() request: RegisterRequest,
  ): Promise<RegisterResponse> {
    const runner = await this.runnersService.register(request.contributorName);
    return { runnerId: runner.id, token: runner.token };
  }

  @Post(":id/heartbeat")
  @HttpCode(HttpStatus.NO_CONTENT)
  async heartbeat(
    @Param("id") id: string,
    @Headers("x-runner-token") runnerToken: string,
    @Body() request: HeartbeatRequest,
  ): Promise<void> {
    await this.runnersService.heartbeat(
      id,
      runnerToken,
      request.quotaRemainingToday,
    );
  }
}
