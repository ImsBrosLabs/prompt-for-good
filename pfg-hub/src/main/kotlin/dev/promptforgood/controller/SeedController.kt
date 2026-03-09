package dev.promptforgood.controller

import dev.promptforgood.service.GitHubService
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RequestParam
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/seed")
class SeedController(private val githubService: GitHubService) {

    @PostMapping("/repo")
    fun seedRepo(
        @RequestParam owner: String,
        @RequestParam name: String
    ) {
        githubService.seedRepo(owner, name)
    }

    @PostMapping("/default")
    fun seedDefault() {
        // Some good initial target repos for M1
        githubService.seedRepo("spring-projects", "spring-boot")
        githubService.seedRepo("psf", "requests")
        githubService.seedRepo("scikit-learn", "scikit-learn")
    }
}
