import {
  CanActivate,
  ExecutionContext,
  Inject,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { APP_CONFIG, AppConfig } from "../config";

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AdminTokenGuard implements CanActivate {
  constructor(@Inject(APP_CONFIG) private readonly config: AppConfig) {}

  /** Allows seed endpoints only when X-Admin-Token matches ADMIN_KEY. */
  canActivate(context: ExecutionContext): boolean {
    const { adminKey } = this.config;
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
