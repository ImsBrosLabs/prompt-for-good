import {
  Body,
  Controller,
  Get,
  Headers,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Res,
} from "@nestjs/common";
import { components } from "../types/openapi";
import { IssuesService } from "./issues.service";

type DoneRequest = components["schemas"]["DoneRequest"];
type IssueDto = components["schemas"]["IssueDto"];
type HttpResponse = { status: (statusCode: number) => unknown };

@Controller("issues")
export class IssuesController {
  constructor(private readonly issuesService: IssuesService) {}

  @Get("next")
  async getNextIssue(
    @Headers("x-runner-token") runnerToken: string,
    @Res({ passthrough: true }) response: HttpResponse,
  ): Promise<IssueDto | undefined> {
    const issue = await this.issuesService.getNextIssue(runnerToken);
    if (!issue) {
      response.status(HttpStatus.NO_CONTENT);
      return undefined;
    }
    return issue;
  }

  @Post(":id/claim")
  @HttpCode(HttpStatus.OK)
  async claimIssue(
    @Param("id") id: string,
    @Headers("x-runner-token") runnerToken: string,
  ): Promise<IssueDto> {
    return this.issuesService.claimIssue(id, runnerToken);
  }

  @Post(":id/done")
  @HttpCode(HttpStatus.NO_CONTENT)
  async reportDone(
    @Param("id") id: string,
    @Headers("x-runner-token") runnerToken: string,
    @Body() request: DoneRequest,
  ): Promise<void> {
    await this.issuesService.reportDone(id, runnerToken, request);
  }
}
