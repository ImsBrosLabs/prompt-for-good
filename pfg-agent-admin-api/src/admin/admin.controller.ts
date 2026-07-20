import {
  BadRequestException,
  Body,
  Controller,
  Delete,
  Get,
  Param,
  Put,
  Req,
  UseGuards,
} from "@nestjs/common";
import { ApiOkResponse, ApiSecurity, ApiTags } from "@nestjs/swagger";
import { AdminTokenGuard } from "../auth/admin-token.guard";
import {
  RuntimeConfigItemDto,
  RuntimeConfigListResponseDto,
  RuntimeConfigUpdateRequestDto,
} from "../openapi/dtos";
import { RuntimeConfigKey } from "../runtime-config/runtime-config.catalog";
import { RuntimeConfigService } from "../runtime-config/runtime-config.service";
import { AdminListResponse } from "./admin.service";

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Controller("admin")
@ApiTags("Local agent admin")
@ApiSecurity("AdminToken")
@UseGuards(AdminTokenGuard)
export class AdminController {
  constructor(private readonly runtimeConfigService: RuntimeConfigService) {}

  @Get("session")
  @ApiOkResponse({ description: "Local admin credentials are valid" })
  validateSession(): { authenticated: true } {
    return { authenticated: true };
  }

  @Get("configuration")
  @ApiOkResponse({
    description: "Lists local runner runtime configuration values",
    type: RuntimeConfigListResponseDto,
  })
  async listConfiguration(): Promise<AdminListResponse<RuntimeConfigItemDto>> {
    const data = await this.runtimeConfigService.list();
    return { data, total: data.length };
  }

  @Put("configuration/:key")
  @ApiOkResponse({
    description: "Stores a local runtime configuration override",
    type: RuntimeConfigItemDto,
  })
  /** Stores a validated runtime override without accepting keys outside the catalog. */
  updateConfiguration(
    @Param("key") key: string,
    @Body() body: RuntimeConfigUpdateRequestDto,
    @Req() request: RequestWithHeaders,
  ): Promise<RuntimeConfigItemDto> {
    if (!body || !Object.prototype.hasOwnProperty.call(body, "value")) {
      throw new BadRequestException("Missing runtime configuration value");
    }

    return this.runtimeConfigService.set(
      key as RuntimeConfigKey,
      body.value,
      this.adminActor(request),
    );
  }

  @Delete("configuration/:key")
  @ApiOkResponse({
    description: "Deletes a local runtime configuration override",
    type: RuntimeConfigItemDto,
  })
  /** Removes a runtime override so resolution falls back through env/default. */
  resetConfiguration(@Param("key") key: string): Promise<RuntimeConfigItemDto> {
    return this.runtimeConfigService.reset(key as RuntimeConfigKey);
  }

  /** Records a non-secret actor marker without persisting the admin token itself. */
  private adminActor(request: RequestWithHeaders): string {
    const header = request.headers["x-admin-user"];
    return typeof header === "string" && header.trim()
      ? header.trim()
      : "local-admin";
  }
}
