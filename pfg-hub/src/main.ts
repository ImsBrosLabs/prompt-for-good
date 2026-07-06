import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { APP_CONFIG, AppConfig } from "./config";
import { GlobalExceptionFilter } from "./errors/global-exception.filter";
import { configureOpenApi } from "./openapi/swagger";

/** Builds the Nest/Fastify application and starts the HTTP server. */
async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  configureOpenApi(app);

  const { port } = app.get<AppConfig>(APP_CONFIG);
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
