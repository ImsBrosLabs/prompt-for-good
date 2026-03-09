package dev.promptforgood.repository

import dev.promptforgood.model.Repo
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface RepoRepository : JpaRepository<Repo, String> {
    fun findByGithubUrl(githubUrl: String): Repo?
    fun findAllByEligibleTrue(): List<Repo>
}
