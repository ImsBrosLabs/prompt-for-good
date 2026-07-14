import { Global, Module } from "@nestjs/common";
import { ConfigModule, ConfigService } from "@nestjs/config";

export type AppConfig = {
  port: number;
  corsOrigins: string[];
  configDatabasePath: string;
};

export const APP_CONFIG = Symbol("APP_CONFIG");

type EnvReader = Pick<ConfigService, "get">;

function readEnv(
  configService: EnvReader | undefined,
  key: string,
): string | undefined {
  return configService?.get<string>(key) ?? process.env[key];
}

/** Reads local admin infrastructure settings needed before runtime config is available. */
export function loadConfig(configService?: EnvReader): AppConfig {
  return {
    port: Number(readEnv(configService, "PORT") ?? 8091),
    corsOrigins: (
      readEnv(configService, "CORS_ORIGINS") ??
      "http://localhost:5174,http://127.0.0.1:5174"
    )
      .split(",")
      .map((origin) => origin.trim())
      .filter(Boolean),
    configDatabasePath:
      readEnv(configService, "CONFIG_DATABASE_PATH") ??
      "./data/pfg-agent-admin.sqlite",
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
