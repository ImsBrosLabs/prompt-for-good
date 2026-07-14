import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { AppConfig, loadConfig } from "./config";
import { configureOpenApi } from "./openapi/swagger";

/** Restricts browser API access to configured local admin origins. */
export function configureCors(
  app: NestFastifyApplication,
  config: AppConfig,
): void {
  app.enableCors({
    origin: config.corsOrigins,
    credentials: true,
    allowedHeaders: ["Content-Type", "X-Admin-Token"],
  });
}

/** Builds the local Nest/Fastify application and starts the HTTP server. */
async function bootstrap() {
  const config = loadConfig();
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  configureCors(app, config);
  configureOpenApi(app);

  await app.listen(config.port, "0.0.0.0");
}

void bootstrap();
