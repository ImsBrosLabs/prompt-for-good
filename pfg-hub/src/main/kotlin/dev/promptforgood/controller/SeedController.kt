package dev.promptforgood.controller

import dev.promptforgood.service.GitHubService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/seed")
@Tag(name = "Seed", description = "Repository seeding — add GitHub repos to the tracking queue")
class SeedController(
    private val githubService: GitHubService,
) {
    @Operation(
        summary = "Seed a single repository",
        description = "Fetches open issues from the given GitHub repository and adds them to the scoring queue.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "200", description = "Repository seeded successfully"),
        ApiResponse(responseCode = "400", description = "Missing owner or name parameter"),
        ApiResponse(responseCode = "502", description = "GitHub API unreachable or rate-limited"),
    )
    @PostMapping("/repo")
    fun seedRepo(
        @Parameter(description = "GitHub organisation or user login", example = "spring-projects", required = true)
        @RequestParam owner: String,
        @Parameter(description = "Repository name", example = "spring-boot", required = true)
        @RequestParam name: String,
    ) {
        githubService.seedRepo(owner, name)
    }

    @Operation(
        summary = "Seed default repositories",
        description = "Seeds a curated list of well-known repositories (spring-boot, requests, scikit-learn) useful for initial setup.",
    )
    @ApiResponse(responseCode = "200", description = "Default repositories seeded successfully")
    @PostMapping("/default")
    fun seedDefault() {
        // Some good initial target repos for M1
        githubService.seedRepo("spring-projects", "spring-boot")
        githubService.seedRepo("psf", "requests")
        githubService.seedRepo("scikit-learn", "scikit-learn")
    }
}
