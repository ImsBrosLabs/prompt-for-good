import { Global, Module } from "@nestjs/common";

export type AppConfig = {
  port: number;
  httpsEnabled: boolean;
  httpsCertPath: string;
  httpsKeyPath: string;
  databaseUrl: string;
  githubToken: string;
  adminKey: string;
  issueMaxRetries: number;
  issueMinScore: number;
  githubIngestionEnabled: boolean;
  githubIngestionCron: string;
  githubRecrawlAfterMs: number;
  githubMaxRetries: number;
  githubBackoffBaseMs: number;
  githubDiscoveryMaxPagesPerLabel: number;
  githubDiscoveryMaxRepositories: number;
  githubMinRateLimitRemaining: number;
};

export const APP_CONFIG = Symbol("APP_CONFIG");

/** Reads runtime settings from the environment and applies local defaults. */
export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8080),
    httpsEnabled: process.env.HTTPS_ENABLED === "true",
    httpsCertPath:
      process.env.HTTPS_CERT_PATH ?? "./certs/hub.pfg.local.pem",
    httpsKeyPath:
      process.env.HTTPS_KEY_PATH ?? "./certs/hub.pfg.local-key.pem",
    databaseUrl:
      process.env.DATABASE_URL ?? "postgresql://pfg:pfg@localhost:5432/pfg",
    githubToken: process.env.GITHUB_TOKEN ?? "dummy",
    adminKey: process.env.ADMIN_KEY ?? "",
    issueMaxRetries: Number(process.env.ISSUE_MAX_RETRIES ?? 3),
    issueMinScore: Number(process.env.ISSUE_MIN_SCORE ?? 60),
    githubIngestionEnabled: process.env.GITHUB_INGESTION_ENABLED === "true",
    githubIngestionCron: process.env.GITHUB_INGESTION_CRON ?? "0 */6 * * *",
    githubRecrawlAfterMs: Number(
      process.env.GITHUB_RECRAWL_AFTER_MS ?? 6 * 60 * 60 * 1000,
    ),
    githubMaxRetries: Number(process.env.GITHUB_MAX_RETRIES ?? 3),
    githubBackoffBaseMs: Number(process.env.GITHUB_BACKOFF_BASE_MS ?? 1000),
    githubDiscoveryMaxPagesPerLabel: Number(
      process.env.GITHUB_DISCOVERY_MAX_PAGES_PER_LABEL ?? 2,
    ),
    githubDiscoveryMaxRepositories: Number(
      process.env.GITHUB_DISCOVERY_MAX_REPOSITORIES ?? 50,
    ),
    githubMinRateLimitRemaining: Number(
      process.env.GITHUB_MIN_RATE_LIMIT_REMAINING ?? 5,
    ),
  };
}

@Global()
@Module({
  providers: [
    {
      provide: APP_CONFIG,
      useFactory: loadConfig,
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
