package dev.promptforgood.repository

import dev.promptforgood.model.Issue
import dev.promptforgood.model.IssueStatus
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface IssueRepository : JpaRepository<Issue, String> {
    fun findByGithubId(githubId: Long): Issue?

    fun findFirstByStatusOrderByScoreDescCreatedAtAsc(status: IssueStatus): Issue?

    fun countByStatus(status: IssueStatus): Long
}
