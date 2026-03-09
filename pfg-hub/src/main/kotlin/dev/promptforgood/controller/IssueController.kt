package dev.promptforgood.controller

import dev.promptforgood.api.IssuesApi
import dev.promptforgood.api.model.DoneRequest
import dev.promptforgood.api.model.IssueDto
import dev.promptforgood.api.model.IssueStatus
import dev.promptforgood.model.Issue
import dev.promptforgood.service.IssueService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RestController
import java.time.ZoneOffset

@RestController
class IssueController(
    private val issueService: IssueService,
) : IssuesApi {
    override fun getNextIssue(xRunnerToken: String): ResponseEntity<IssueDto> {
        val issue = issueService.getNextIssue(xRunnerToken)
        return if (issue != null) ResponseEntity.ok(issue.toDto()) else ResponseEntity.noContent().build()
    }

    override fun claimIssue(
        id: String,
        xRunnerToken: String,
    ): ResponseEntity<IssueDto> {
        val issue = issueService.claimIssue(id, xRunnerToken)
        return ResponseEntity.ok(issue.toDto())
    }

    override fun reportDone(
        id: String,
        xRunnerToken: String,
        doneRequest: DoneRequest,
    ): ResponseEntity<Unit> {
        issueService.reportDone(id, xRunnerToken, doneRequest)
        return ResponseEntity.noContent().build()
    }
}

// ---------------------------------------------------------------------------
// Mapping helper — keeps JPA entity out of the API layer
// ---------------------------------------------------------------------------
private fun Issue.toDto() =
    IssueDto(
        id = id,
        githubId = githubId,
        title = title,
        body = body,
        githubUrl = githubUrl,
        labels = labels,
        score = score,
        status = IssueStatus.valueOf(status.name),
        claimedBy = claimedBy,
        claimedAt = claimedAt?.atOffset(ZoneOffset.UTC),
        retryCount = retryCount,
        createdAt = createdAt.atOffset(ZoneOffset.UTC),
        updatedAt = updatedAt.atOffset(ZoneOffset.UTC),
    )
