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

  /** Allows protected admin endpoints only when X-Admin-Token matches ADMIN_KEY. */
  async canActivate(context: ExecutionContext): Promise<boolean> {
    const adminKey = await this.runtimeConfigService.get("adminKey");
    const request = context.switchToHttp().getRequest<RequestWithHeaders>();
    const token = request.headers["x-admin-token"];

    if (!adminKey) {
      throw new UnauthorizedException("Admin key not configured");
    }
    if (typeof token !== "string" || token !== adminKey) {
      throw new UnauthorizedException("Invalid or missing X-Admin-Token");
    }

    return true;
  }
}
