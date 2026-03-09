package dev.promptforgood.controller

import dev.promptforgood.model.Issue
import dev.promptforgood.service.IssueService
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
class IssueController(
    private val issueService: IssueService,
) {
    /** Returns the next pending issue from the FIFO queue. */
    @GetMapping("/next")
    fun getNextIssue(
        @RequestHeader("X-Runner-Token") runnerToken: String,
    ): ResponseEntity<Issue> {
        val issue = issueService.getNextIssue(runnerToken)
        return if (issue != null) ResponseEntity.ok(issue) else ResponseEntity.noContent().build()
    }

    /** Runner claims an issue and starts working on it. */
    @PostMapping("/{id}/claim")
    fun claimIssue(
        @PathVariable id: String,
        @RequestHeader("X-Runner-Token") runnerToken: String,
    ): ResponseEntity<Issue> {
        val issue = issueService.claimIssue(id, runnerToken)
        return ResponseEntity.ok(issue)
    }

    /** Runner reports completion (success or failure). */
    @PostMapping("/{id}/done")
    fun reportDone(
        @PathVariable id: String,
        @RequestHeader("X-Runner-Token") runnerToken: String,
        @RequestBody body: DoneRequest,
    ): ResponseEntity<Void> {
        issueService.reportDone(id, runnerToken, body)
        return ResponseEntity.noContent().build()
    }
}

data class DoneRequest(
    val success: Boolean,
    val prUrl: String? = null,
    val tokensUsed: Long? = null,
    val errorMessage: String? = null,
)
