package dev.promptforgood.controller

import dev.promptforgood.model.Issue
import dev.promptforgood.service.IssueService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.GetMapping
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/issues")
@Tag(name = "Issues", description = "Issue queue management — claim and report on GitHub issues")
@SecurityRequirement(name = "RunnerToken")
class IssueController(
    private val issueService: IssueService,
) {
    @Operation(
        summary = "Get next pending issue",
        description = "Returns the highest-scored pending issue from the queue. Returns 204 when the queue is empty.",
    )
    @ApiResponses(
        ApiResponse(
            responseCode = "200",
            description = "Next issue available",
            content = [Content(schema = Schema(implementation = Issue::class))],
        ),
        ApiResponse(responseCode = "204", description = "No pending issue in the queue"),
        ApiResponse(responseCode = "401", description = "Invalid or missing runner token"),
    )
    @GetMapping("/next")
    fun getNextIssue(
        @Parameter(description = "Runner authentication token", required = true)
        @RequestHeader("X-Runner-Token") runnerToken: String,
    ): ResponseEntity<Issue> {
        val issue = issueService.getNextIssue(runnerToken)
        return if (issue != null) ResponseEntity.ok(issue) else ResponseEntity.noContent().build()
    }

    @Operation(
        summary = "Claim an issue",
        description = "Marks the issue as CLAIMED by the calling runner and starts the work timer.",
    )
    @ApiResponses(
        ApiResponse(
            responseCode = "200",
            description = "Issue successfully claimed",
            content = [Content(schema = Schema(implementation = Issue::class))],
        ),
        ApiResponse(responseCode = "401", description = "Invalid or missing runner token"),
        ApiResponse(responseCode = "404", description = "Issue not found"),
        ApiResponse(responseCode = "409", description = "Issue already claimed by another runner"),
    )
    @PostMapping("/{id}/claim")
    fun claimIssue(
        @Parameter(description = "Issue UUID", required = true) @PathVariable id: String,
        @Parameter(description = "Runner authentication token", required = true)
        @RequestHeader("X-Runner-Token") runnerToken: String,
    ): ResponseEntity<Issue> {
        val issue = issueService.claimIssue(id, runnerToken)
        return ResponseEntity.ok(issue)
    }

    @Operation(
        summary = "Report issue completion",
        description = "Runner reports success or failure for a claimed issue. Failed issues may be retried up to the configured maximum.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "204", description = "Report accepted"),
        ApiResponse(responseCode = "400", description = "Invalid request body"),
        ApiResponse(responseCode = "401", description = "Invalid or missing runner token"),
        ApiResponse(responseCode = "404", description = "Issue not found"),
    )
    @PostMapping("/{id}/done")
    fun reportDone(
        @Parameter(description = "Issue UUID", required = true) @PathVariable id: String,
        @Parameter(description = "Runner authentication token", required = true)
        @RequestHeader("X-Runner-Token") runnerToken: String,
        @RequestBody body: DoneRequest,
    ): ResponseEntity<Void> {
        issueService.reportDone(id, runnerToken, body)
        return ResponseEntity.noContent().build()
    }
}

@Schema(description = "Payload sent by the runner when it finishes working on an issue")
data class DoneRequest(
    @field:Schema(description = "Whether the runner succeeded in opening a PR", example = "true")
    val success: Boolean,
    @field:Schema(description = "URL of the opened pull request", example = "https://github.com/owner/repo/pull/42", nullable = true)
    val prUrl: String? = null,
    @field:Schema(description = "Total Claude tokens consumed during the work session", example = "12500", nullable = true)
    val tokensUsed: Long? = null,
    @field:Schema(description = "Human-readable error message when success is false", nullable = true)
    val errorMessage: String? = null,
)
