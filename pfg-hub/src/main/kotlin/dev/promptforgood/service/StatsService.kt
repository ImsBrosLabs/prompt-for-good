package dev.promptforgood.service

import dev.promptforgood.api.model.StatsResponse
import dev.promptforgood.model.IssueStatus
import dev.promptforgood.repository.ContributionRepository
import dev.promptforgood.repository.IssueRepository
import dev.promptforgood.repository.RepoRepository
import dev.promptforgood.repository.RunnerRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional

@Service
class StatsService(
    private val repoRepository: RepoRepository,
    private val issueRepository: IssueRepository,
    private val runnerRepository: RunnerRepository,
    private val contributionRepository: ContributionRepository,
) {
    @Transactional(readOnly = true)
    fun getStats(): StatsResponse =
        StatsResponse(
            totalRepos = repoRepository.count(),
            eligibleRepos = repoRepository.findAllByEligibleTrue().size.toLong(),
            totalIssues = issueRepository.count(),
            pendingIssues = issueRepository.countByStatus(IssueStatus.PENDING),
            claimedIssues = issueRepository.countByStatus(IssueStatus.CLAIMED),
            doneIssues = issueRepository.countByStatus(IssueStatus.DONE),
            failedIssues = issueRepository.countByStatus(IssueStatus.FAILED),
            totalPrsOpened = contributionRepository.count(),
            activeRunners = runnerRepository.countByActiveTrue(),
        )
}
