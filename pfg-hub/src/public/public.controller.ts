import { Controller, Get, Inject, Query } from "@nestjs/common";
import { ApiOkResponse, ApiOperation, ApiQuery, ApiTags } from "@nestjs/swagger";
import {
  PublicRepoListResponseDto,
  TokenUsageResponseDto,
} from "../openapi/dtos";
import { PublicService } from "./public.service";

type PublicRepoQuery = {
  limit?: string;
  offset?: string;
  q?: string;
  eligible?: string;
};

@Controller()
@ApiTags("Public")
export class PublicController {
  constructor(
    @Inject(PublicService) private readonly publicService: PublicService,
  ) {}

  @Get("repos")
  @ApiOperation({
    summary: "List public repositories",
    description:
      "Returns public repository metadata for the hub dashboard with bounded pagination.",
  })
  @ApiQuery({ name: "limit", required: false, type: Number })
  @ApiQuery({ name: "offset", required: false, type: Number })
  @ApiQuery({ name: "q", required: false, type: String })
  @ApiQuery({ name: "eligible", required: false, type: Boolean })
  @ApiOkResponse({
    description: "Public repositories",
    type: PublicRepoListResponseDto,
  })
  listRepos(@Query() query: PublicRepoQuery): Promise<PublicRepoListResponseDto> {
    return this.publicService.listRepos(query);
  }

  @Get("token-usage")
  @ApiOperation({
    summary: "Get public token usage",
    description:
      "Returns aggregate token usage and contribution outcomes without exposing contribution details.",
  })
  @ApiOkResponse({
    description: "Aggregate token usage",
    type: TokenUsageResponseDto,
  })
  getTokenUsage(): Promise<TokenUsageResponseDto> {
    return this.publicService.getTokenUsage();
  }
}
