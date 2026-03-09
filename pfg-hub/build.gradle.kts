import org.jetbrains.kotlin.gradle.dsl.JvmTarget

plugins {
    id("org.springframework.boot") version "4.0.3"
    id("io.spring.dependency-management") version "1.1.7"
    kotlin("jvm") version "2.2.0"
    kotlin("plugin.spring") version "2.2.0"
    kotlin("plugin.jpa") version "2.2.0"
    id("org.jlleitschuh.gradle.ktlint") version "12.1.1"
    id("org.openapi.generator") version "7.6.0"
}

group = "dev.promptforgood"
version = "0.1.0-SNAPSHOT"

repositories {
    mavenCentral()
}

// ---------------------------------------------------------------------------
// OpenAPI code generation (contract-first)
// ---------------------------------------------------------------------------
openApiGenerate {
    generatorName.set("kotlin-spring")
    inputSpec.set("$projectDir/src/main/resources/static/openapi.yml")
    outputDir.set(layout.buildDirectory.dir("generated").get().asFile.absolutePath)
    apiPackage.set("dev.promptforgood.api")
    modelPackage.set("dev.promptforgood.api.model")
    configOptions.set(
        mapOf(
            // Generate only interfaces — controllers provide the implementation
            "interfaceOnly" to "true",
            "skipDefaultInterface" to "true",
            // Spring Boot 3 / Jakarta EE
            "useSpringBoot3" to "true",
            // One interface per OpenAPI tag
            "useTags" to "true",
            // Do not add springdoc/swagger annotations — the YAML is the spec
            "documentationProvider" to "none",
            "serializationLibrary" to "jackson",
            "useOptional" to "false",
        ),
    )
}

// Include generated sources in the main compilation
sourceSets {
    main {
        kotlin {
            srcDir(layout.buildDirectory.dir("generated/src/main/kotlin"))
        }
    }
}

tasks.compileKotlin {
    dependsOn(tasks.openApiGenerate)
}

tasks.withType<org.jlleitschuh.gradle.ktlint.tasks.KtLintCheckTask> {
    dependsOn(tasks.openApiGenerate)
}

// ---------------------------------------------------------------------------
// Dependencies
// ---------------------------------------------------------------------------
dependencies {
    // Spring Boot
    implementation("org.springframework.boot:spring-boot-starter-web")
    implementation("org.springframework.boot:spring-boot-starter-data-jpa")
    implementation("org.springframework.boot:spring-boot-starter-validation")
    implementation("org.springframework.boot:spring-boot-starter-security")
    implementation("org.springframework.boot:spring-boot-starter-actuator")

    // Kotlin
    implementation("tools.jackson.module:jackson-module-kotlin")
    implementation("org.jetbrains.kotlin:kotlin-reflect")

    // Database
    runtimeOnly("org.postgresql:postgresql")
    implementation("org.flywaydb:flyway-core")
    implementation("org.flywaydb:flyway-database-postgresql")

    // OpenAPI / Swagger UI — serves the static openapi.yml via Swagger UI
    implementation("org.springdoc:springdoc-openapi-starter-webmvc-ui:2.5.0")

    // HTTP Client (for GitHub API)
    implementation("org.springframework.boot:spring-boot-starter-webflux")

    // Test
    testImplementation("org.springframework.boot:spring-boot-starter-test")
    testImplementation("org.springframework.security:spring-security-test")
    testImplementation("io.mockk:mockk:1.13.11")
    testImplementation("com.ninja-squad:springmockk:5.0.0")
    testRuntimeOnly("com.h2database:h2")
}

kotlin {
    compilerOptions {
        freeCompilerArgs.addAll("-Xjsr305=strict")
        jvmTarget.set(JvmTarget.JVM_21)
    }
}

tasks.withType<Test> {
    useJUnitPlatform()
}

ktlint {
    version.set("1.3.1")
    filter {
        // Do not lint generated sources
        exclude { it.file.path.contains(layout.buildDirectory.get().asFile.absolutePath) }
    }
}
