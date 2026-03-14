package dev.promptforgood.service

import dev.promptforgood.model.IssueStatus
import dev.promptforgood.model.Repo
import dev.promptforgood.repository.ContributionRepository
import dev.promptforgood.repository.IssueRepository
import dev.promptforgood.repository.RepoRepository
import dev.promptforgood.repository.RunnerRepository
import io.mockk.every
import io.mockk.mockk
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Test

class StatsServiceTest {
    private val repoRepository = mockk<RepoRepository>()
    private val issueRepository = mockk<IssueRepository>()
    private val runnerRepository = mockk<RunnerRepository>()
    private val contributionRepository = mockk<ContributionRepository>()
    private val statsService = StatsService(repoRepository, issueRepository, runnerRepository, contributionRepository)

    @Test
    fun `getStats aggregates counts from all repositories`() {
        every { repoRepository.count() } returns 5
        every { repoRepository.findAllByEligibleTrue() } returns listOf(Repo(), Repo(), Repo())
        every { issueRepository.count() } returns 20
        every { issueRepository.countByStatus(IssueStatus.PENDING) } returns 10
        every { issueRepository.countByStatus(IssueStatus.CLAIMED) } returns 3
        every { issueRepository.countByStatus(IssueStatus.DONE) } returns 5
        every { issueRepository.countByStatus(IssueStatus.FAILED) } returns 2
        every { contributionRepository.count() } returns 8
        every { runnerRepository.countByActiveTrue() } returns 4

        val stats = statsService.getStats()

        assertEquals(5, stats.totalRepos)
        assertEquals(3, stats.eligibleRepos)
        assertEquals(20, stats.totalIssues)
        assertEquals(10, stats.pendingIssues)
        assertEquals(3, stats.claimedIssues)
        assertEquals(5, stats.doneIssues)
        assertEquals(2, stats.failedIssues)
        assertEquals(8, stats.totalPrsOpened)
        assertEquals(4, stats.activeRunners)
    }

    @Test
    fun `getStats returns zeros when all repositories are empty`() {
        every { repoRepository.count() } returns 0
        every { repoRepository.findAllByEligibleTrue() } returns emptyList()
        every { issueRepository.count() } returns 0
        every { issueRepository.countByStatus(any()) } returns 0
        every { contributionRepository.count() } returns 0
        every { runnerRepository.countByActiveTrue() } returns 0

        val stats = statsService.getStats()

        assertEquals(0, stats.totalRepos)
        assertEquals(0, stats.eligibleRepos)
        assertEquals(0, stats.totalIssues)
        assertEquals(0, stats.pendingIssues)
        assertEquals(0, stats.claimedIssues)
        assertEquals(0, stats.doneIssues)
        assertEquals(0, stats.failedIssues)
        assertEquals(0, stats.totalPrsOpened)
        assertEquals(0, stats.activeRunners)
    }

    @Test
    fun `getStats eligible repos count uses findAllByEligibleTrue list size`() {
        every { repoRepository.count() } returns 10
        every { repoRepository.findAllByEligibleTrue() } returns listOf(Repo(), Repo())
        every { issueRepository.count() } returns 0
        every { issueRepository.countByStatus(any()) } returns 0
        every { contributionRepository.count() } returns 0
        every { runnerRepository.countByActiveTrue() } returns 0

        val stats = statsService.getStats()

        // totalRepos comes from count(), eligibleRepos from findAllByEligibleTrue().size
        assertEquals(10, stats.totalRepos)
        assertEquals(2, stats.eligibleRepos)
    }
}
