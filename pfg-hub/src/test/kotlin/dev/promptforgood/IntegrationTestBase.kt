package dev.promptforgood

import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.postgresql.PostgreSQLContainer

/**
 * Shared base for all @SpringBootTest integration tests.
 *
 * Docker-based test runs provide SPRING_DATASOURCE_* and reuse the Postgres
 * service from Docker Compose. Native runs without those variables fall back to
 * a Testcontainers PostgreSQL instance, started once for the whole JVM process.
 *
 * @DynamicPropertySource injects the JDBC URL / credentials into every Spring
 * context that loads this base class, so each context connects to the selected database.
 */
@ActiveProfiles("test")
abstract class IntegrationTestBase {
    companion object {
        private val externalJdbcUrl = System.getenv("SPRING_DATASOURCE_URL")?.takeIf { it.isNotBlank() }
        private val externalUsername =
            System.getenv("SPRING_DATASOURCE_USERNAME")?.takeIf { it.isNotBlank() } ?: "pfg"
        private val externalPassword =
            System.getenv("SPRING_DATASOURCE_PASSWORD")?.takeIf { it.isNotBlank() } ?: "pfg"

        private val postgres =
            if (externalJdbcUrl == null) {
                PostgreSQLContainer("postgres:17-alpine").apply { start() }
            } else {
                null
            }

        @DynamicPropertySource
        @JvmStatic
        fun configureDataSource(registry: DynamicPropertyRegistry) {
            val jdbcUrl = externalJdbcUrl
            if (jdbcUrl != null) {
                registry.add("spring.datasource.url") { jdbcUrl }
                registry.add("spring.datasource.username") { externalUsername }
                registry.add("spring.datasource.password") { externalPassword }
                return
            }

            val container = requireNotNull(postgres)
            registry.add("spring.datasource.url") { container.jdbcUrl }
            registry.add("spring.datasource.username") { container.username }
            registry.add("spring.datasource.password") { container.password }
        }
    }
}
