package dev.promptforgood.controller

import dev.promptforgood.service.StatsService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/stats")
@Tag(name = "Stats", description = "Platform-level statistics")
class StatsController(
    private val statsService: StatsService,
) {
    @Operation(
        summary = "Get platform statistics",
        description = "Returns aggregated counts for repositories, issues and runners across the entire platform.",
    )
    @ApiResponse(
        responseCode = "200",
        description = "Current platform statistics",
        content = [Content(schema = Schema(implementation = StatsResponse::class))],
    )
    @GetMapping
    fun getStats(): StatsResponse = statsService.getStats()
}

@Schema(description = "Aggregated platform statistics")
data class StatsResponse(
    @field:Schema(description = "Total number of tracked repositories", example = "42")
    val totalRepos: Long,
    @field:Schema(description = "Repositories meeting the minimum score threshold", example = "30")
    val eligibleRepos: Long,
    @field:Schema(description = "Total issues ingested from GitHub", example = "1500")
    val totalIssues: Long,
    @field:Schema(description = "Issues waiting to be claimed", example = "200")
    val pendingIssues: Long,
    @field:Schema(description = "Issues currently being worked on by a runner", example = "10")
    val claimedIssues: Long,
    @field:Schema(description = "Issues completed with a merged PR", example = "800")
    val doneIssues: Long,
    @field:Schema(description = "Issues that exhausted all retry attempts", example = "50")
    val failedIssues: Long,
    @field:Schema(description = "Total pull requests successfully opened", example = "850")
    val totalPrsOpened: Long,
    @field:Schema(description = "Runners that sent a heartbeat in the last 30 minutes", example = "5")
    val activeRunners: Long,
)
