package dev.promptforgood

import org.springframework.test.context.ActiveProfiles
import org.springframework.test.context.DynamicPropertyRegistry
import org.springframework.test.context.DynamicPropertySource
import org.testcontainers.postgresql.PostgreSQLContainer

/**
 * Shared base for all @SpringBootTest integration tests.
 *
 * The container is started once in the companion object static initializer and
 * reused for the entire JVM process, across every subclass and every Spring
 * application context (including those with @MockkBean that force a new context).
 * Testcontainers registers a JVM shutdown hook that stops the container at the end.
 *
 * @DynamicPropertySource injects the JDBC URL / credentials into every Spring
 * context that loads this base class, so each context connects to the same database.
 */
@ActiveProfiles("test")
abstract class IntegrationTestBase {
    companion object {
        private val postgres: PostgreSQLContainer =
            PostgreSQLContainer("postgres:17-alpine").apply { start() }

        @DynamicPropertySource
        @JvmStatic
        fun configureDataSource(registry: DynamicPropertyRegistry) {
            registry.add("spring.datasource.url", postgres::getJdbcUrl)
            registry.add("spring.datasource.username", postgres::getUsername)
            registry.add("spring.datasource.password", postgres::getPassword)
        }
    }
}
