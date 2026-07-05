export type AppConfig = {
  port: number;
  databaseUrl: string;
  githubToken: string;
  adminKey: string;
  issueMaxRetries: number;
  issueMinScore: number;
};

/** Reads runtime settings from the environment and applies local defaults. */
export function loadConfig(): AppConfig {
  return {
    port: Number(process.env.PORT ?? 8080),
    databaseUrl:
      process.env.DATABASE_URL ?? "postgresql://pfg:pfg@localhost:5432/pfg",
    githubToken: process.env.GITHUB_TOKEN ?? "dummy",
    adminKey: process.env.ADMIN_KEY ?? "",
    issueMaxRetries: Number(process.env.ISSUE_MAX_RETRIES ?? 3),
    issueMinScore: Number(process.env.ISSUE_MIN_SCORE ?? 60),
  };
}
