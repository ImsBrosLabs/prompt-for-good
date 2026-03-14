package dev.promptforgood.controller

import dev.promptforgood.api.SeedApi
import dev.promptforgood.service.GitHubService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RestController

@RestController
class SeedController(
    private val githubService: GitHubService,
) : SeedApi {
    override fun seedRepo(
        xAdminToken: String,
        owner: String,
        name: String,
    ): ResponseEntity<Unit> {
        githubService.seedRepo(owner, name)
        return ResponseEntity.ok().build()
    }

    override fun seedDefault(xAdminToken: String): ResponseEntity<Unit> {
        // Some good initial target repos for M1
        githubService.seedRepo("spring-projects", "spring-boot")
        githubService.seedRepo("psf", "requests")
        githubService.seedRepo("scikit-learn", "scikit-learn")
        return ResponseEntity.ok().build()
    }
}
