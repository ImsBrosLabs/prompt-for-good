import {
  CanActivate,
  ExecutionContext,
  Injectable,
  UnauthorizedException,
} from "@nestjs/common";
import { loadConfig } from "../config";

type RequestWithHeaders = {
  headers: Record<string, string | string[] | undefined>;
};

@Injectable()
export class AdminTokenGuard implements CanActivate {
  /** Allows seed endpoints only when X-Admin-Token matches ADMIN_KEY. */
  canActivate(context: ExecutionContext): boolean {
    const { adminKey } = loadConfig();
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
