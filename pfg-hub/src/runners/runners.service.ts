import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { eq } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DATABASE, Database } from "../db/database.module";
import { Runner, runners } from "../db/schema";

@Injectable()
export class RunnersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Creates a runner identity and its long-lived authentication token. */
  async register(contributorName: string): Promise<Runner> {
    if (!contributorName?.trim()) {
      throw new BadRequestException("Missing or invalid contributor name");
    }

    const [runner] = await this.db
      .insert(runners)
      .values({
        id: randomUUID(),
        token: randomUUID(),
        contributorName: contributorName.trim(),
        active: true,
      })
      .returning();

    return runner;
  }

  /** Records liveness and remaining quota for an existing authenticated runner. */
  async heartbeat(
    id: string,
    token: string,
    quotaRemaining: number,
  ): Promise<void> {
    const [runner] = await this.db
      .select()
      .from(runners)
      .where(eq(runners.id, id))
      .limit(1);
    if (!runner) throw new NotFoundException("Runner not found");
    if (runner.token !== token)
      throw new UnauthorizedException("Invalid token");

    await this.db
      .update(runners)
      .set({
        quotaRemainingToday: quotaRemaining,
        lastSeenAt: new Date(),
        active: true,
      })
      .where(eq(runners.id, id));
  }

  /** Resolves a runner token to its runner or rejects the request. */
  async validateToken(token: string): Promise<Runner> {
    if (!token) throw new UnauthorizedException("Invalid runner token");

    const [runner] = await this.db
      .select()
      .from(runners)
      .where(eq(runners.token, token))
      .limit(1);
    if (!runner) throw new UnauthorizedException("Invalid runner token");

    return runner;
  }
}
