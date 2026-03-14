package dev.promptforgood.controller

import dev.promptforgood.IntegrationTestBase
import dev.promptforgood.model.Issue
import dev.promptforgood.model.IssueStatus
import dev.promptforgood.model.Repo
import dev.promptforgood.model.Runner
import dev.promptforgood.repository.ContributionRepository
import dev.promptforgood.repository.IssueRepository
import dev.promptforgood.repository.RepoRepository
import dev.promptforgood.repository.RunnerRepository
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
class StatsControllerIntegrationTest : IntegrationTestBase() {
    @Autowired lateinit var wac: WebApplicationContext

    @Autowired lateinit var runnerRepository: RunnerRepository

    @Autowired lateinit var issueRepository: IssueRepository

    @Autowired lateinit var repoRepository: RepoRepository

    @Autowired lateinit var contributionRepository: ContributionRepository

    private lateinit var mockMvc: MockMvc

    @BeforeEach
    fun setUp() {
        val builder: DefaultMockMvcBuilder = MockMvcBuilders.webAppContextSetup(wac)
        val configured: DefaultMockMvcBuilder = builder.apply(springSecurity())
        mockMvc = configured.build()
        contributionRepository.deleteAll()
        issueRepository.deleteAll()
        runnerRepository.deleteAll()
        repoRepository.deleteAll()
    }

    @Test
    fun `GET stats returns 200 with all expected fields`() {
        mockMvc
            .get("/stats")
            .andExpect {
                status { isOk() }
                jsonPath("$.totalRepos") { exists() }
                jsonPath("$.eligibleRepos") { exists() }
                jsonPath("$.totalIssues") { exists() }
                jsonPath("$.pendingIssues") { exists() }
                jsonPath("$.claimedIssues") { exists() }
                jsonPath("$.doneIssues") { exists() }
                jsonPath("$.failedIssues") { exists() }
                jsonPath("$.totalPrsOpened") { exists() }
                jsonPath("$.activeRunners") { exists() }
            }
    }

    @Test
    fun `GET stats returns zeros when database is empty`() {
        mockMvc
            .get("/stats")
            .andExpect {
                status { isOk() }
                jsonPath("$.totalRepos") { value(0) }
                jsonPath("$.eligibleRepos") { value(0) }
                jsonPath("$.totalIssues") { value(0) }
                jsonPath("$.pendingIssues") { value(0) }
                jsonPath("$.claimedIssues") { value(0) }
                jsonPath("$.doneIssues") { value(0) }
                jsonPath("$.failedIssues") { value(0) }
                jsonPath("$.totalPrsOpened") { value(0) }
                jsonPath("$.activeRunners") { value(0) }
            }
    }

    @Test
    fun `GET stats reflects actual database state`() {
        val repo =
            repoRepository.save(
                Repo(
                    githubUrl = "https://github.com/owner/repo",
                    owner = "owner",
                    name = "repo",
                    stars = 100,
                    eligible = true,
                ),
            )
        repoRepository.save(
            Repo(
                githubUrl = "https://github.com/owner/repo2",
                owner = "owner",
                name = "repo2",
                stars = 10,
                eligible = false,
            ),
        )
        runnerRepository.save(Runner(token = "tok-1", contributorName = "Alice", active = true))
        runnerRepository.save(Runner(token = "tok-2", contributorName = "Bob", active = false))

        issueRepository.save(
            Issue(
                repo = repo,
                githubId = 1,
                title = "Issue 1",
                githubUrl = "https://github.com/1",
                labels = "bug",
                score = 70,
                status = IssueStatus.PENDING,
            ),
        )
        issueRepository.save(
            Issue(
                repo = repo,
                githubId = 2,
                title = "Issue 2",
                githubUrl = "https://github.com/2",
                labels = "bug",
                score = 65,
                status = IssueStatus.DONE,
            ),
        )

        mockMvc
            .get("/stats")
            .andExpect {
                status { isOk() }
                jsonPath("$.totalRepos") { value(2) }
                jsonPath("$.eligibleRepos") { value(1) }
                jsonPath("$.totalIssues") { value(2) }
                jsonPath("$.pendingIssues") { value(1) }
                jsonPath("$.doneIssues") { value(1) }
                jsonPath("$.activeRunners") { value(1) }
            }
    }
}
