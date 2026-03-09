package dev.promptforgood.service

import dev.promptforgood.model.Issue
import dev.promptforgood.model.IssueStatus
import dev.promptforgood.model.Repo
import dev.promptforgood.repository.IssueRepository
import dev.promptforgood.repository.RepoRepository
import org.springframework.beans.factory.annotation.Value
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import org.springframework.web.reactive.function.client.WebClient
import java.time.Instant

@Service
class GitHubService(
    private val repoRepository: RepoRepository,
    private val issueRepository: IssueRepository,
    private val scoringService: ScoringService,
    @Value("\${pfg.github.token}") private val githubToken: String,
) {
    private val webClient =
        WebClient
            .builder()
            .baseUrl("https://api.github.com")
            .defaultHeader("Authorization", "Bearer $githubToken")
            .defaultHeader("Accept", "application/vnd.github.v3+json")
            .build()

    @Transactional
    fun crawlRepo(repoId: String) {
        val repo = repoRepository.findById(repoId).orElseThrow { RuntimeException("Repo not found") }
        val response =
            webClient
                .get()
                .uri("/repos/${repo.owner}/${repo.name}/issues?state=open&labels=bug,good%20first%20issue,help%20wanted")
                .retrieve()
                .bodyToFlux(Map::class.java)
                .collectList()
                .block() ?: emptyList()

        response.forEach { issueData ->
            val githubId = (issueData["id"] as Number).toLong()
            val existing = issueRepository.findByGithubId(githubId)

            if (existing == null) {
                val title = issueData["title"] as String
                val body = issueData["body"] as? String
                val githubUrl = issueData["html_url"] as String
                val labelsList = (issueData["labels"] as? List<Map<String, String>>) ?: emptyList()
                val labelsStr = labelsList.map { it["name"] }.joinToString(",")

                val newIssue =
                    Issue(
                        repo = repo,
                        githubId = githubId,
                        title = title,
                        body = body,
                        githubUrl = githubUrl,
                        labels = labelsStr,
                        status = IssueStatus.PENDING,
                        createdAt = Instant.now(),
                        updatedAt = Instant.now(),
                    )

                val score = scoringService.scoreIssue(newIssue)
                if (score >= 60) {
                    issueRepository.save(newIssue.copy(score = score))
                }
            }
        }

        repoRepository.save(repo.copy(lastCrawledAt = Instant.now()))
    }

    @Transactional
    fun seedRepo(
        owner: String,
        name: String,
    ) {
        val githubUrl = "https://github.com/$owner/$name"
        if (repoRepository.findByGithubUrl(githubUrl) != null) return

        val repoData =
            webClient
                .get()
                .uri("/repos/$owner/$name")
                .retrieve()
                .bodyToMono(Map::class.java)
                .block() ?: throw RuntimeException("Repo not found on GitHub")

        val stars = (repoData["stargazers_count"] as Number).toInt()
        val language = repoData["language"] as? String

        val repo =
            Repo(
                githubUrl = githubUrl,
                owner = owner,
                name = name,
                language = language,
                stars = stars,
                eligible = stars >= 50,
            )
        val savedRepo = repoRepository.save(repo)
        if (savedRepo.eligible) {
            crawlRepo(savedRepo.id)
        }
    }
}
