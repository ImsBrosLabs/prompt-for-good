import { NestFactory } from "@nestjs/core";
import {
  FastifyAdapter,
  NestFastifyApplication,
} from "@nestjs/platform-fastify";
import "reflect-metadata";
import { AppModule } from "./app.module";
import { loadConfig } from "./config";
import { GlobalExceptionFilter } from "./errors/global-exception.filter";
import { configureOpenApi } from "./openapi/swagger";

async function bootstrap() {
  const app = await NestFactory.create<NestFastifyApplication>(
    AppModule,
    new FastifyAdapter(),
  );

  app.useGlobalFilters(new GlobalExceptionFilter());
  configureOpenApi(app);

  const { port } = loadConfig();
  await app.listen(port, "0.0.0.0");
}

void bootstrap();
