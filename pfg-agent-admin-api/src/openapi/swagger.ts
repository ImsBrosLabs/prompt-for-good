import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

/** Mounts OpenAPI documentation for the local agent admin API. */
export function configureOpenApi(app: INestApplication): void {
  const config = new DocumentBuilder()
    .setTitle("Prompt for Good Agent Admin API")
    .setDescription(
      "Local API for configuring Prompt for Good runner runtime settings.",
    )
    .setVersion("0.1.0")
    .addApiKey(
      { type: "apiKey", name: "X-Admin-Token", in: "header" },
      "AdminToken",
    )
    .build();

  const document = SwaggerModule.createDocument(app, config);
  SwaggerModule.setup("docs", app, document);
}
