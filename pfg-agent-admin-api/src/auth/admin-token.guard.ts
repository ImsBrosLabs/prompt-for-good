import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { RuntimeConfigService } from "../runtime-config/runtime-config.service";

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(
    @Inject(RuntimeConfigService)
    private readonly runtimeConfigService: RuntimeConfigService,
  ) {}

  /** Allows local admin endpoints only when X-Admin-Token matches config. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const adminToken = await this.runtimeConfigService.get(
      "PFG_AGENT_ADMIN_TOKEN",
    );
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = request.headers["x-admin-token"];

    if (!adminToken) {
      throw new UnauthorizedException("Local admin token not configured");
    }
    if (typeof token !== "string" || token !== adminToken) {
      throw new UnauthorizedException("Invalid or missing X-Admin-Token");
    }

    return true;
  }
}
