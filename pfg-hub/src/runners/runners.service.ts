import {
  BadRequestException,
  Inject,
  Injectable,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { and, eq, isNull, lt, or } from "drizzle-orm";
import { randomUUID } from "node:crypto";
import { DATABASE, Database } from "../db/database.module";
import {
  IssueDifficulty,
  Runner,
  RunnerPreferences,
  runners,
} from "../db/schema";

@Injectable()
export class RunnersService {
  constructor(@Inject(DATABASE) private readonly db: Database) {}

  /** Creates a runner identity and its long-lived authentication token. */
  async register(
    contributorName: string,
    preferences?: RunnerPreferences,
  ): Promise<Runner> {
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
        lastSeenAt: new Date(),
        preferences: this.normalizePreferences(preferences),
      })
      .returning();

    return runner;
  }

  /** Records liveness and remaining quota for an existing authenticated runner. */
  async heartbeat(
    id: string,
    token: string,
    quotaRemaining: number,
    preferences?: RunnerPreferences,
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
        ...(preferences === undefined
          ? {}
          : { preferences: this.normalizePreferences(preferences) }),
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

  /** Marks active runners stale when they have no fresh heartbeat evidence. */
  async expireInactiveRunners(cutoff: Date): Promise<void> {
    await this.db
      .update(runners)
      .set({ active: false })
      .where(
        and(
          eq(runners.active, true),
          or(isNull(runners.lastSeenAt), lt(runners.lastSeenAt, cutoff)),
        ),
      );
  }

  /** Canonicalizes user-owned dispatch policy before storing it on the runner. */
  private normalizePreferences(
    preferences: RunnerPreferences | undefined,
  ): RunnerPreferences {
    if (!preferences) return {};
    const maxDifficulty = this.normalizeDifficulty(preferences.maxDifficulty);
    const maxEstimatedMinutes = Number.isFinite(preferences.maxEstimatedMinutes)
      ? Math.max(0, Math.floor(preferences.maxEstimatedMinutes!))
      : undefined;

    return {
      allowedRepos: this.normalizeList(preferences.allowedRepos),
      blockedRepos: this.normalizeList(preferences.blockedRepos),
      languages: this.normalizeList(preferences.languages),
      ecosystems: this.normalizeList(preferences.ecosystems),
      licenses: this.normalizeList(preferences.licenses),
      labels: this.normalizeList(preferences.labels),
      ...(maxDifficulty ? { maxDifficulty } : {}),
      ...(maxEstimatedMinutes !== undefined ? { maxEstimatedMinutes } : {}),
    };
  }

  /** Stores list preferences as lowercase unique terms for deterministic matching. */
  private normalizeList(values: string[] | undefined): string[] {
    if (!Array.isArray(values)) return [];
    return [
      ...new Set(
        values.map((value) => value.trim().toLowerCase()).filter(Boolean),
      ),
    ];
  }

  /** Accepts only known difficulty tiers so invalid preference input falls back to no cap. */
  private normalizeDifficulty(
    value: IssueDifficulty | undefined,
  ): IssueDifficulty | undefined {
    return value === "easy" || value === "medium" || value === "hard"
      ? value
      : undefined;
  }
}
