package dev.promptforgood.controller

import dev.promptforgood.service.StatsService
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/stats")
class StatsController(
    private val statsService: StatsService,
) {
    @GetMapping
    fun getStats(): StatsResponse = statsService.getStats()
}

data class StatsResponse(
    val totalRepos: Long,
    val eligibleRepos: Long,
    val totalIssues: Long,
    val pendingIssues: Long,
    val claimedIssues: Long,
    val doneIssues: Long,
    val failedIssues: Long,
    val totalPrsOpened: Long,
    val activeRunners: Long,
)
