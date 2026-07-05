import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Inject,
  Param,
  Post,
  Req,
  Res,
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
import { DoneRequestDto, IssueDto } from "../openapi/dtos";
import { IssuesService } from "./issues.service";

type HttpResponse = { status: (statusCode: number) => unknown };

@Controller("issues")
@ApiTags("Issues")
export class IssuesController {
  constructor(
    @Inject(IssuesService) private readonly issuesService: IssuesService,
  ) {}

  @Get("next")
  @ApiOperation({
    summary: "Get the next pending issue",
    description:
      "Returns the highest-scored pending issue from the queue. Returns 204 when the queue is empty.",
  })
  @ApiSecurity("RunnerToken")
  @ApiOkResponse({ description: "Next issue available", type: IssueDto })
  @ApiNoContentResponse({ description: "No pending issue in the queue" })
  @ApiUnauthorizedResponse({ description: "Invalid or missing runner token" })
  /** Serves the next issue or returns 204 when the queue has no work. */
  async getNextIssue(
    @Req() request: RequestWithHeaders,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<IssueDto | undefined> {
    const runnerToken = getHeader(request, "x-runner-token");
    const issue = await this.issuesService.getNextIssue(runnerToken);
    if (!issue) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return issue;
  }

  @Post(":id/claim")
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: "Claim an issue",
    description:
      "Marks the issue as CLAIMED by the calling runner and starts the work timer.",
  })
  @ApiSecurity("RunnerToken")
  @ApiParam({ name: "id", description: "Issue UUID" })
  @ApiOkResponse({
    description: "Issue successfully claimed",
    type: IssueDto,
  })
  @ApiUnauthorizedResponse({ description: "Invalid or missing runner token" })
  @ApiNotFoundResponse({ description: "Issue not found" })
  @ApiResponse({
    status: 409,
    description: "Issue already claimed by another runner",
  })
  /** Lets a runner claim a specific pending issue before starting work. */
  async claimIssue(
    @Param("id") id: string,
    @Req() request: RequestWithHeaders,
  ): Promise<IssueDto> {
    const runnerToken = getHeader(request, "x-runner-token");
    return this.issuesService.claimIssue(id, runnerToken);
  }

  @Post(":id/done")
  @HttpCode(HttpStatus.NO_CONTENT)
  @ApiOperation({
    summary: "Report issue completion",
    description:
      "Runner reports success or failure for a claimed issue. Failed issues may be retried up to the configured maximum (default: 3).",
  })
  @ApiSecurity("RunnerToken")
  @ApiParam({ name: "id", description: "Issue UUID" })
  @ApiBody({ type: DoneRequestDto })
  @ApiNoContentResponse({ description: "Report accepted" })
  @ApiResponse({ status: 400, description: "Invalid request body" })
  @ApiUnauthorizedResponse({ description: "Invalid or missing runner token" })
  @ApiNotFoundResponse({ description: "Issue not found" })
  /** Accepts a runner's success/failure report for a claimed issue. */
  async reportDone(
    @Param("id") id: string,
    @Req() request: RequestWithHeaders,
    @Body() body: DoneRequestDto,
  ): Promise<void> {
    const runnerToken = getHeader(request, "x-runner-token");
    await this.issuesService.reportDone(id, runnerToken, body);
  }
}
