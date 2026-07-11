import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

export type AppConfig = {
  port: number;
  httpsEnabled: boolean;
  httpsCertPath: string;
  httpsKeyPath: string;
  databaseUrl: string;
  githubToken: string;
  adminKey: string;
  corsOrigins: string[];
};

export const APP_CONFIG = Symbol("APP_CONFIG");

type EnvReader = Pick<ConfigService, "get">;

function readEnv(
  configService: EnvReader | undefined,
  key: string,
): string | undefined {
  return configService?.get<string>(key) ?? process.env[key];
}

/** Reads infrastructure settings from @nestjs/config and applies local defaults. */
export function loadConfig(configService?: EnvReader): AppConfig {
  return {
    port: Number(readEnv(configService, "PORT") ?? 8080),
    httpsEnabled: readEnv(configService, "HTTPS_ENABLED") === "true",
    httpsCertPath:
      readEnv(configService, "HTTPS_CERT_PATH") ?? "./certs/hub.pfg.local.pem",
    httpsKeyPath:
      readEnv(configService, "HTTPS_KEY_PATH") ??
      "./certs/hub.pfg.local-key.pem",
    databaseUrl:
      readEnv(configService, "DATABASE_URL") ??
      "postgresql://pfg:pfg@localhost:5432/pfg",
    githubToken: readEnv(configService, "GITHUB_TOKEN") ?? "dummy",
    adminKey: readEnv(configService, "ADMIN_KEY") ?? "",
    corsOrigins: (
      readEnv(configService, "CORS_ORIGINS") ??
      "http://localhost:5173,http://127.0.0.1:5173"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
  };
}

@Global()
@Module({
  imports: [ConfigModule.forRoot({ ignoreEnvFile: true, isGlobal: true })],
  providers: [
    {
      provide: APP_CONFIG,
      inject: [ConfigService],
      useFactory: loadConfig,
    },
  ],
  exports: [APP_CONFIG],
})
export class AppConfigModule {}
