package dev.promptforgood.service

import dev.promptforgood.api.model.DoneRequest
import dev.promptforgood.model.ContributionStatus
import dev.promptforgood.model.Issue
import dev.promptforgood.model.IssueStatus
import dev.promptforgood.model.Repo
import dev.promptforgood.model.Runner
import dev.promptforgood.repository.ContributionRepository
import dev.promptforgood.repository.IssueRepository
import dev.promptforgood.repository.RunnerRepository
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotNull
import org.junit.jupiter.api.Assertions.assertNull
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.util.Optional

class IssueServiceTest {
    private val issueRepository = mockk<IssueRepository>()
    private val runnerRepository = mockk<RunnerRepository>()
    private val contributionRepository = mockk<ContributionRepository>()
    private val issueService = IssueService(issueRepository, runnerRepository, contributionRepository)

    private val runner = Runner(id = "runner-1", token = "valid-token", contributorName = "Alice")
    private val repo =
        Repo(
            id = "repo-1",
            owner = "owner",
            name = "repo",
            githubUrl = "https://github.com/owner/repo",
        )
    private val pendingIssue =
        Issue(
            id = "issue-1",
            repo = repo,
            githubId = 42,
            title = "Bug in feature X",
            githubUrl = "https://github.com/owner/repo/issues/42",
            labels = "bug",
            score = 70,
            status = IssueStatus.PENDING,
        )

    // -------------------------------------------------------------------------
    // getNextIssue
    // -------------------------------------------------------------------------

    @Test
    fun `getNextIssue returns pending issue for valid token`() {
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findFirstByStatusOrderByScoreDescCreatedAtAsc(IssueStatus.PENDING) } returns pendingIssue

        val result = issueService.getNextIssue("valid-token")

        assertEquals(pendingIssue, result)
    }

    @Test
    fun `getNextIssue returns null when no pending issues exist`() {
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findFirstByStatusOrderByScoreDescCreatedAtAsc(IssueStatus.PENDING) } returns null

        assertNull(issueService.getNextIssue("valid-token"))
    }

    @Test
    fun `getNextIssue throws RuntimeException for invalid token`() {
        every { runnerRepository.findByToken("bad-token") } returns null

        assertThrows<RuntimeException> { issueService.getNextIssue("bad-token") }
    }

    // -------------------------------------------------------------------------
    // claimIssue
    // -------------------------------------------------------------------------

    @Test
    fun `claimIssue sets status to CLAIMED and associates the runner`() {
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(pendingIssue)
        every { issueRepository.save(any()) } answers { firstArg() }

        val result = issueService.claimIssue("issue-1", "valid-token")

        assertEquals(IssueStatus.CLAIMED, result.status)
        assertEquals("runner-1", result.claimedBy)
        assertNotNull(result.claimedAt)
    }

    @Test
    fun `claimIssue throws when issue is not found`() {
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("missing") } returns Optional.empty()

        assertThrows<RuntimeException> { issueService.claimIssue("missing", "valid-token") }
    }

    @Test
    fun `claimIssue throws when issue is already claimed`() {
        val alreadyClaimed = pendingIssue.copy(status = IssueStatus.CLAIMED)
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(alreadyClaimed)

        assertThrows<RuntimeException> { issueService.claimIssue("issue-1", "valid-token") }
    }

    @Test
    fun `claimIssue throws when issue is already done`() {
        val doneIssue = pendingIssue.copy(status = IssueStatus.DONE)
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(doneIssue)

        assertThrows<RuntimeException> { issueService.claimIssue("issue-1", "valid-token") }
    }

    @Test
    fun `claimIssue throws for invalid token`() {
        every { runnerRepository.findByToken("bad-token") } returns null

        assertThrows<RuntimeException> { issueService.claimIssue("issue-1", "bad-token") }
    }

    // -------------------------------------------------------------------------
    // reportDone — success path
    // -------------------------------------------------------------------------

    @Test
    fun `reportDone marks issue as DONE and saves a SUCCESS contribution`() {
        val claimedIssue = pendingIssue.copy(status = IssueStatus.CLAIMED, claimedBy = "runner-1")
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(claimedIssue)
        every { issueRepository.save(any()) } answers { firstArg() }
        every { contributionRepository.save(any()) } answers { firstArg() }

        val request =
            DoneRequest(
                success = true,
                prUrl = "https://github.com/pr/1",
                tokensUsed = 1000,
                errorMessage = null,
            )
        issueService.reportDone("issue-1", "valid-token", request)

        verify { issueRepository.save(match { it.status == IssueStatus.DONE }) }
        verify { contributionRepository.save(match { it.status == ContributionStatus.SUCCESS && it.prUrl == "https://github.com/pr/1" }) }
    }

    // -------------------------------------------------------------------------
    // reportDone — failure / retry logic
    // -------------------------------------------------------------------------

    @Test
    fun `reportDone on first failure resets issue to PENDING with incremented retryCount`() {
        val claimedIssue = pendingIssue.copy(status = IssueStatus.CLAIMED, claimedBy = "runner-1", retryCount = 0)
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(claimedIssue)
        every { issueRepository.save(any()) } answers { firstArg() }
        every { contributionRepository.save(any()) } answers { firstArg() }

        val request = DoneRequest(success = false, prUrl = null, tokensUsed = null, errorMessage = "oops")
        issueService.reportDone("issue-1", "valid-token", request)

        verify { issueRepository.save(match { it.status == IssueStatus.PENDING && it.retryCount == 1 }) }
        verify { contributionRepository.save(match { it.status == ContributionStatus.FAILED }) }
    }

    @Test
    fun `reportDone on second failure resets issue to PENDING with retryCount 2`() {
        val claimedIssue = pendingIssue.copy(status = IssueStatus.CLAIMED, claimedBy = "runner-1", retryCount = 1)
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(claimedIssue)
        every { issueRepository.save(any()) } answers { firstArg() }
        every { contributionRepository.save(any()) } answers { firstArg() }

        val request = DoneRequest(success = false, prUrl = null, tokensUsed = null, errorMessage = "oops")
        issueService.reportDone("issue-1", "valid-token", request)

        verify { issueRepository.save(match { it.status == IssueStatus.PENDING && it.retryCount == 2 }) }
    }

    @Test
    fun `reportDone on third failure permanently marks issue as FAILED`() {
        val claimedIssue = pendingIssue.copy(status = IssueStatus.CLAIMED, claimedBy = "runner-1", retryCount = 2)
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(claimedIssue)
        every { issueRepository.save(any()) } answers { firstArg() }
        every { contributionRepository.save(any()) } answers { firstArg() }

        val request = DoneRequest(success = false, prUrl = null, tokensUsed = null, errorMessage = "still failing")
        issueService.reportDone("issue-1", "valid-token", request)

        verify { issueRepository.save(match { it.status == IssueStatus.FAILED && it.retryCount == 3 }) }
    }

    @Test
    fun `reportDone retryCount is not incremented on success`() {
        val claimedIssue = pendingIssue.copy(status = IssueStatus.CLAIMED, claimedBy = "runner-1", retryCount = 1)
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(claimedIssue)
        every { issueRepository.save(any()) } answers { firstArg() }
        every { contributionRepository.save(any()) } answers { firstArg() }

        val request = DoneRequest(success = true, prUrl = "https://github.com/pr/2", tokensUsed = 500, errorMessage = null)
        issueService.reportDone("issue-1", "valid-token", request)

        verify { issueRepository.save(match { it.status == IssueStatus.DONE && it.retryCount == 1 }) }
    }

    // -------------------------------------------------------------------------
    // reportDone — error cases
    // -------------------------------------------------------------------------

    @Test
    fun `reportDone throws when issue was claimed by a different runner`() {
        val claimedByOther = pendingIssue.copy(status = IssueStatus.CLAIMED, claimedBy = "other-runner")
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("issue-1") } returns Optional.of(claimedByOther)

        val request = DoneRequest(success = true, prUrl = null, tokensUsed = null, errorMessage = null)
        assertThrows<RuntimeException> { issueService.reportDone("issue-1", "valid-token", request) }
    }

    @Test
    fun `reportDone throws for invalid token`() {
        every { runnerRepository.findByToken("bad-token") } returns null

        val request = DoneRequest(success = true, prUrl = null, tokensUsed = null, errorMessage = null)
        assertThrows<RuntimeException> { issueService.reportDone("issue-1", "bad-token", request) }
    }

    @Test
    fun `reportDone throws when issue is not found`() {
        every { runnerRepository.findByToken("valid-token") } returns runner
        every { issueRepository.findById("missing") } returns Optional.empty()

        val request = DoneRequest(success = true, prUrl = null, tokensUsed = null, errorMessage = null)
        assertThrows<RuntimeException> { issueService.reportDone("missing", "valid-token", request) }
    }
}
