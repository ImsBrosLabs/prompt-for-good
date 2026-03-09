package dev.promptforgood.service

import dev.promptforgood.controller.DoneRequest
import dev.promptforgood.model.*
import dev.promptforgood.repository.ContributionRepository
import dev.promptforgood.repository.IssueRepository
import dev.promptforgood.repository.RunnerRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant

@Service
class IssueService(
    private val issueRepository: IssueRepository,
    private val runnerRepository: RunnerRepository,
    private val contributionRepository: ContributionRepository
) {

    @Transactional(readOnly = true)
    fun getNextIssue(runnerToken: String): Issue? {
        validateToken(runnerToken)
        return issueRepository.findFirstByStatusOrderByScoreDescCreatedAtAsc(IssueStatus.PENDING)
    }

    @Transactional
    fun claimIssue(id: String, runnerToken: String): Issue {
        val runner = validateToken(runnerToken)
        val issue = issueRepository.findById(id).orElseThrow { RuntimeException("Issue not found") }

        if (issue.status != IssueStatus.PENDING) {
            throw RuntimeException("Issue already claimed or completed")
        }

        val updatedIssue = issue.copy(
            status = IssueStatus.CLAIMED,
            claimedBy = runner.id,
            claimedAt = Instant.now(),
            updatedAt = Instant.now()
        )
        return issueRepository.save(updatedIssue)
    }

    @Transactional
    fun reportDone(id: String, runnerToken: String, request: DoneRequest) {
        val runner = validateToken(runnerToken)
        val issue = issueRepository.findById(id).orElseThrow { RuntimeException("Issue not found") }

        if (issue.claimedBy != runner.id) {
            throw RuntimeException("Issue not claimed by this runner")
        }

        val status = if (request.success) IssueStatus.DONE else IssueStatus.FAILED
        val retryCount = if (request.success) issue.retryCount else issue.retryCount + 1

        val finalStatus = if (!request.success && retryCount >= 3) IssueStatus.FAILED else status
        val nextStatus = if (!request.success && retryCount < 3) IssueStatus.PENDING else finalStatus

        val updatedIssue = issue.copy(
            status = nextStatus,
            retryCount = retryCount,
            updatedAt = Instant.now()
        )
        issueRepository.save(updatedIssue)

        val contribution = Contribution(
            issue = issue,
            runner = runner,
            prUrl = request.prUrl,
            status = if (request.success) ContributionStatus.SUCCESS else ContributionStatus.FAILED,
            tokensUsed = request.tokensUsed,
            errorMessage = request.errorMessage
        )
        contributionRepository.save(contribution)
    }

    private fun validateToken(token: String): Runner {
        return runnerRepository.findByToken(token) ?: throw RuntimeException("Invalid runner token")
    }
}
