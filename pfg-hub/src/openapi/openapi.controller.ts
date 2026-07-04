import { Controller, Get, Header } from "@nestjs/common";
import { readFileSync } from "node:fs";
import { join } from "node:path";

@Controller()
export class OpenApiController {
  @Get("openapi.yml")
  @Header("content-type", "application/yaml; charset=utf-8")
  openApiYaml(): string {
    return readFileSync(
      join(process.cwd(), "src/main/resources/static/openapi.yml"),
      "utf8",
    );
  }

  @Get("swagger-ui.html")
  @Header("content-type", "text/html; charset=utf-8")
  swaggerUi(): string {
    return `<!doctype html>
<html>
<head>
  <title>PFG Hub API</title>
  <link rel="stylesheet" href="https://unpkg.com/swagger-ui-dist@5/swagger-ui.css">
</head>
<body>
  <div id="swagger-ui"></div>
  <script src="https://unpkg.com/swagger-ui-dist@5/swagger-ui-bundle.js"></script>
  <script>window.ui = SwaggerUIBundle({ url: "/openapi.yml", dom_id: "#swagger-ui" });</script>
</body>
</html>`;
  }
}
