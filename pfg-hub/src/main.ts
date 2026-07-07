import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import { existsSync, readFileSync } from "node:fs";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { AppConfig, loadConfig } from "./config";
import { GlobalExceptionFilter } from "./errors/global-exception.filter";
import { configureOpenApi } from "./openapi/swagger";

function createFastifyAdapter(config: AppConfig): FastifyAdapter {
  if (!config.httpsEnabled) {
    return new FastifyAdapter();
  }

  const hasCertificates =
    existsSync(config.httpsCertPath) && existsSync(config.httpsKeyPath);

  if (!hasCertificates) {
    console.warn(
      `HTTPS_ENABLED=true but local certificates were not found at ${config.httpsCertPath} and ${config.httpsKeyPath}; starting HTTP instead.`,
    );
    return new FastifyAdapter();
  }

  return new FastifyAdapter({
    https: {
      cert: readFileSync(config.httpsCertPath),
      key: readFileSync(config.httpsKeyPath),
    },
  });
}

/** Builds the Nest/Fastify application and starts the HTTP server. */
async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    createFastifyAdapter(config),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  configureOpenApi(app);

  await app.listen(config.port, "0.0.0.0");
}

void bootstrap();
