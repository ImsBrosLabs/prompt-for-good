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
import org.springframework.http.MediaType
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.get
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
class IssueControllerIntegrationTest : IntegrationTestBase() {
    @Autowired lateinit var wac: WebApplicationContext

    @Autowired lateinit var runnerRepository: RunnerRepository

    @Autowired lateinit var issueRepository: IssueRepository

    @Autowired lateinit var repoRepository: RepoRepository

    @Autowired lateinit var contributionRepository: ContributionRepository

    private lateinit var mockMvc: MockMvc
    private lateinit var savedRunner: Runner
    private lateinit var savedRepo: Repo

    @BeforeEach
    fun setUp() {
        val builder: DefaultMockMvcBuilder = MockMvcBuilders.webAppContextSetup(wac)
        val configured: DefaultMockMvcBuilder = builder.apply(springSecurity())
        mockMvc = configured.build()
        contributionRepository.deleteAll()
        issueRepository.deleteAll()
        runnerRepository.deleteAll()
        repoRepository.deleteAll()

        savedRunner =
            runnerRepository.save(
                Runner(token = "runner-token", contributorName = "Alice", active = true),
            )
        savedRepo =
            repoRepository.save(
                Repo(
                    githubUrl = "https://github.com/owner/repo",
                    owner = "owner",
                    name = "repo",
                    stars = 100,
                    eligible = true,
                ),
            )
    }

    private fun saveIssue(
        score: Int = 70,
        status: IssueStatus = IssueStatus.PENDING,
        claimedBy: String? = null,
        retryCount: Int = 0,
        githubId: Long = (1L..Long.MAX_VALUE).random(),
    ): Issue =
        issueRepository.save(
            Issue(
                repo = savedRepo,
                githubId = githubId,
                title = "Test Issue",
                githubUrl = "https://github.com/owner/repo/issues/$githubId",
                labels = "bug",
                score = score,
                status = status,
                claimedBy = claimedBy,
                retryCount = retryCount,
            ),
        )

    // -------------------------------------------------------------------------
    // GET /issues/next
    // -------------------------------------------------------------------------

    @Test
    fun `GET issues-next returns the highest-scored pending issue`() {
        saveIssue(score = 60, githubId = 1)
        saveIssue(score = 90, githubId = 2)
        saveIssue(score = 75, githubId = 3)

        mockMvc
            .get("/issues/next") {
                header("X-Runner-Token", savedRunner.token)
            }.andExpect {
                status { isOk() }
                jsonPath("$.score") { value(90) }
                jsonPath("$.status") { value("PENDING") }
            }
    }

    @Test
    fun `GET issues-next returns 204 when no pending issues exist`() {
        mockMvc
            .get("/issues/next") {
                header("X-Runner-Token", savedRunner.token)
            }.andExpect {
                status { isNoContent() }
            }
    }

    @Test
    fun `GET issues-next skips claimed issues`() {
        saveIssue(status = IssueStatus.CLAIMED, claimedBy = savedRunner.id, githubId = 1)

        mockMvc
            .get("/issues/next") {
                header("X-Runner-Token", savedRunner.token)
            }.andExpect {
                status { isNoContent() }
            }
    }

    @Test
    fun `GET issues-next with invalid token returns 500`() {
        mockMvc
            .get("/issues/next") {
                header("X-Runner-Token", "invalid-token")
            }.andExpect {
                status { is5xxServerError() }
            }
    }

    // -------------------------------------------------------------------------
    // POST /issues/{id}/claim
    // -------------------------------------------------------------------------

    @Test
    fun `POST issues-id-claim transitions issue from PENDING to CLAIMED`() {
        val issue = saveIssue(status = IssueStatus.PENDING)

        mockMvc
            .post("/issues/${issue.id}/claim") {
                header("X-Runner-Token", savedRunner.token)
            }.andExpect {
                status { isOk() }
                jsonPath("$.status") { value("CLAIMED") }
                jsonPath("$.claimedBy") { value(savedRunner.id) }
            }

        val updated = issueRepository.findById(issue.id).get()
        assert(updated.status == IssueStatus.CLAIMED)
        assert(updated.claimedBy == savedRunner.id)
    }

    @Test
    fun `POST issues-id-claim on already-claimed issue returns 500`() {
        val issue = saveIssue(status = IssueStatus.CLAIMED, claimedBy = savedRunner.id)

        mockMvc
            .post("/issues/${issue.id}/claim") {
                header("X-Runner-Token", savedRunner.token)
            }.andExpect {
                status { is5xxServerError() }
            }
    }

    @Test
    fun `POST issues-id-claim with invalid token returns 500`() {
        val issue = saveIssue(status = IssueStatus.PENDING)

        mockMvc
            .post("/issues/${issue.id}/claim") {
                header("X-Runner-Token", "bad-token")
            }.andExpect {
                status { is5xxServerError() }
            }
    }

    // -------------------------------------------------------------------------
    // POST /issues/{id}/done
    // -------------------------------------------------------------------------

    @Test
    fun `POST issues-id-done with success=true marks issue as DONE and returns 204`() {
        val issue = saveIssue(status = IssueStatus.CLAIMED, claimedBy = savedRunner.id)

        mockMvc
            .post("/issues/${issue.id}/done") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Runner-Token", savedRunner.token)
                content = """{"success":true,"prUrl":"https://github.com/pr/1","tokensUsed":1000,"errorMessage":null}"""
            }.andExpect {
                status { isNoContent() }
            }

        val updated = issueRepository.findById(issue.id).get()
        assert(updated.status == IssueStatus.DONE)
        assert(contributionRepository.count() == 1L)
    }

    @Test
    fun `POST issues-id-done with success=false and retryCount 0 resets issue to PENDING`() {
        val issue = saveIssue(status = IssueStatus.CLAIMED, claimedBy = savedRunner.id, retryCount = 0)

        mockMvc
            .post("/issues/${issue.id}/done") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Runner-Token", savedRunner.token)
                content = """{"success":false,"prUrl":null,"tokensUsed":null,"errorMessage":"failed"}"""
            }.andExpect {
                status { isNoContent() }
            }

        val updated = issueRepository.findById(issue.id).get()
        assert(updated.status == IssueStatus.PENDING)
        assert(updated.retryCount == 1)
    }

    @Test
    fun `POST issues-id-done with success=false at retryCount 2 permanently fails the issue`() {
        val issue = saveIssue(status = IssueStatus.CLAIMED, claimedBy = savedRunner.id, retryCount = 2)

        mockMvc
            .post("/issues/${issue.id}/done") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Runner-Token", savedRunner.token)
                content = """{"success":false,"prUrl":null,"tokensUsed":null,"errorMessage":"still failing"}"""
            }.andExpect {
                status { isNoContent() }
            }

        val updated = issueRepository.findById(issue.id).get()
        assert(updated.status == IssueStatus.FAILED)
        assert(updated.retryCount == 3)
    }

    @Test
    fun `POST issues-id-done by wrong runner returns 500`() {
        val otherRunner = runnerRepository.save(Runner(token = "other-token", contributorName = "Bob"))
        val issue = saveIssue(status = IssueStatus.CLAIMED, claimedBy = savedRunner.id)

        mockMvc
            .post("/issues/${issue.id}/done") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Runner-Token", otherRunner.token)
                content = """{"success":true,"prUrl":null,"tokensUsed":null,"errorMessage":null}"""
            }.andExpect {
                status { is5xxServerError() }
            }
    }
}
