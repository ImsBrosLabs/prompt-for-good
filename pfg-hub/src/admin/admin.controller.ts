import { Controller, Get, Inject, Query, UseGuards } from "@nestjs/common";
import { ApiOkResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { AdminTokenGuard } from "../auth/admin-token.guard";
import { AdminListResponse, AdminService } from "./admin.service";

type ListQuery = {
  sort?: string;
  range?: string;
  filter?: string;
};

@Controller("admin")
@ApiTags("Admin")
@ApiSecurity("AdminToken")
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(
    @Inject(AdminService) private readonly adminService: AdminService,
  ) {}

  @Get("session")
  @ApiOkResponse({ description: "Admin credentials are valid" })
  validateSession(): { authenticated: true } {
    return { authenticated: true };
  }

  @Get("repositories")
  listRepositories(
    @Query() query: ListQuery,
  ): Promise<AdminListResponse<unknown>> {
    return this.adminService.listRepositories(query);
  }

  @Get("issues")
  listIssues(@Query() query: ListQuery): Promise<AdminListResponse<unknown>> {
    return this.adminService.listIssues(query);
  }

  @Get("runners")
  listRunners(@Query() query: ListQuery): Promise<AdminListResponse<unknown>> {
    return this.adminService.listRunners(query);
  }

  @Get("contributions")
  listContributions(
    @Query() query: ListQuery,
  ): Promise<AdminListResponse<unknown>> {
    return this.adminService.listContributions(query);
  }
}
