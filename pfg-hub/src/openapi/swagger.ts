import { INestApplication } from "@nestjs/common";
import { DocumentBuilder, SwaggerModule } from "@nestjs/swagger";

export function configureOpenApi(app: INestApplication): void {
  const openApiConfig = new DocumentBuilder()
    .setTitle("PFG Hub API")
    .setDescription(
      "REST API for the Prompt-for-Good hub. Manages runners, issues and repository seeding for the autonomous contributor platform.",
    )
    .setVersion("0.1.0")
    .setContact(
      "Prompt for Good",
      "https://github.com/ImsBrosLabs/prompt-for-good",
      "",
    )
    .setLicense("MIT", "")
    .addServer("http://localhost:8080", "Local development")
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "X-Runner-Token",
        description:
          "Token obtained after runner registration via POST /runners/register",
      },
      "RunnerToken",
    )
    .addApiKey(
      {
        type: "apiKey",
        in: "header",
        name: "X-Admin-Token",
        description:
          "Static admin secret configured via the ADMIN_KEY environment variable on the hub. Required for all /seed/** endpoints.",
      },
      "AdminToken",
    )
    .build();

  const openApiDocument = SwaggerModule.createDocument(app, openApiConfig);
  SwaggerModule.setup("docs", app, openApiDocument, {
    jsonDocumentUrl: "docs-json",
    yamlDocumentUrl: "docs-yaml",
  });
}
