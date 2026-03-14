package dev.promptforgood.controller

import com.ninjasquad.springmockk.MockkBean
import dev.promptforgood.IntegrationTestBase
import dev.promptforgood.repository.ContributionRepository
import dev.promptforgood.repository.IssueRepository
import dev.promptforgood.repository.RepoRepository
import dev.promptforgood.repository.RunnerRepository
import dev.promptforgood.service.GitHubService
import io.mockk.justRun
import io.mockk.verify
import org.junit.jupiter.api.BeforeEach
import org.junit.jupiter.api.Test
import org.springframework.beans.factory.annotation.Autowired
import org.springframework.boot.test.context.SpringBootTest
import org.springframework.security.test.web.servlet.setup.SecurityMockMvcConfigurers.springSecurity
import org.springframework.test.web.servlet.MockMvc
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
class SeedControllerIntegrationTest : IntegrationTestBase() {
    @Autowired lateinit var wac: WebApplicationContext

    @MockkBean lateinit var gitHubService: GitHubService

    @Autowired lateinit var contributionRepository: ContributionRepository

    @Autowired lateinit var issueRepository: IssueRepository

    @Autowired lateinit var runnerRepository: RunnerRepository

    @Autowired lateinit var repoRepository: RepoRepository

    private lateinit var mockMvc: MockMvc

    private val adminToken = "test-admin-key"

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

    // -------------------------------------------------------------------------
    // POST /seed/repo
    // -------------------------------------------------------------------------

    @Test
    fun `POST seed-repo with valid admin token delegates to gitHubService and returns 200`() {
        justRun { gitHubService.seedRepo("owner", "repo") }

        mockMvc
            .post("/seed/repo?owner=owner&name=repo") {
                header("X-Admin-Token", adminToken)
            }.andExpect {
                status { isOk() }
            }

        verify { gitHubService.seedRepo("owner", "repo") }
    }

    @Test
    fun `POST seed-repo without admin token returns 401`() {
        mockMvc
            .post("/seed/repo?owner=owner&name=repo")
            .andExpect {
                status { isUnauthorized() }
            }
    }

    @Test
    fun `POST seed-repo with wrong admin token returns 401`() {
        mockMvc
            .post("/seed/repo?owner=owner&name=repo") {
                header("X-Admin-Token", "wrong-key")
            }.andExpect {
                status { isUnauthorized() }
            }
    }

    // -------------------------------------------------------------------------
    // POST /seed/default
    // -------------------------------------------------------------------------

    @Test
    fun `POST seed-default with valid admin token seeds the three default repos and returns 200`() {
        justRun { gitHubService.seedRepo(any(), any()) }

        mockMvc
            .post("/seed/default") {
                header("X-Admin-Token", adminToken)
            }.andExpect {
                status { isOk() }
            }

        verify { gitHubService.seedRepo("spring-projects", "spring-boot") }
        verify { gitHubService.seedRepo("psf", "requests") }
        verify { gitHubService.seedRepo("scikit-learn", "scikit-learn") }
    }

    @Test
    fun `POST seed-default without admin token returns 401`() {
        mockMvc
            .post("/seed/default")
            .andExpect {
                status { isUnauthorized() }
            }
    }
}
