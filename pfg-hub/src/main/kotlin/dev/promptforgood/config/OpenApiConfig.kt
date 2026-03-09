package dev.promptforgood.config

import io.swagger.v3.oas.models.Components
import io.swagger.v3.oas.models.OpenAPI
import io.swagger.v3.oas.models.info.Contact
import io.swagger.v3.oas.models.info.Info
import io.swagger.v3.oas.models.info.License
import io.swagger.v3.oas.models.security.SecurityRequirement
import io.swagger.v3.oas.models.security.SecurityScheme
import org.springframework.context.annotation.Bean
import org.springframework.context.annotation.Configuration

@Configuration
class OpenApiConfig {

    @Bean
    fun openApi(): OpenAPI =
        OpenAPI()
            .info(
                Info()
                    .title("PFG Hub API")
                    .description(
                        "REST API for the Prompt-for-Good hub. " +
                            "Manages runners, issues and repository seeding for the autonomous contributor platform.",
                    )
                    .version("0.1.0")
                    .contact(
                        Contact()
                            .name("Prompt for Good")
                            .url("https://github.com/ImsBrosLabs/prompt-for-good"),
                    )
                    .license(License().name("MIT")),
            )
            .addSecurityItem(SecurityRequirement().addList("RunnerToken"))
            .components(
                Components().addSecuritySchemes(
                    "RunnerToken",
                    SecurityScheme()
                        .type(SecurityScheme.Type.APIKEY)
                        .`in`(SecurityScheme.In.HEADER)
                        .name("X-Runner-Token")
                        .description("Token obtained after runner registration"),
                ),
            )
}
