package dev.promptforgood.controller

import dev.promptforgood.IntegrationTestBase
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
import org.springframework.test.web.servlet.post
import org.springframework.test.web.servlet.setup.DefaultMockMvcBuilder
import org.springframework.test.web.servlet.setup.MockMvcBuilders
import org.springframework.web.context.WebApplicationContext

@SpringBootTest
class RunnerControllerIntegrationTest : IntegrationTestBase() {
    @Autowired lateinit var wac: WebApplicationContext

    @Autowired lateinit var runnerRepository: RunnerRepository

    @Autowired lateinit var contributionRepository: ContributionRepository

    @Autowired lateinit var issueRepository: IssueRepository

    @Autowired lateinit var repoRepository: RepoRepository

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
    fun `POST runners-register creates a new runner and returns runnerId and token`() {
        mockMvc
            .post("/runners/register") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"contributorName": "Alice"}"""
            }.andExpect {
                status { isOk() }
                jsonPath("$.runnerId") { isNotEmpty() }
                jsonPath("$.token") { isNotEmpty() }
            }
    }

    @Test
    fun `POST runners-register persists the runner in the database`() {
        mockMvc
            .post("/runners/register") {
                contentType = MediaType.APPLICATION_JSON
                content = """{"contributorName": "Bob"}"""
            }.andExpect { status { isOk() } }

        val runners = runnerRepository.findAll()
        assert(runners.size == 1)
        assert(runners[0].contributorName == "Bob")
    }

    @Test
    fun `POST runners-register for two contributors creates distinct tokens`() {
        val responseAlice =
            mockMvc
                .post("/runners/register") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"contributorName": "Alice"}"""
                }.andReturn()
                .response.contentAsString

        val responseBob =
            mockMvc
                .post("/runners/register") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"contributorName": "Bob"}"""
                }.andReturn()
                .response.contentAsString

        assert(responseAlice.contains("token"))
        assert(responseBob.contains("token"))
        assert(responseAlice != responseBob)
    }

    @Test
    fun `POST runners-id-heartbeat updates runner quota and returns 204`() {
        val registerResponse =
            mockMvc
                .post("/runners/register") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"contributorName": "Charlie"}"""
                }.andReturn()
                .response.contentAsString

        val runnerId = registerResponse.substringAfter("\"runnerId\":\"").substringBefore("\"")
        val token = registerResponse.substringAfter("\"token\":\"").substringBefore("\"")

        mockMvc
            .post("/runners/$runnerId/heartbeat") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Runner-Token", token)
                content = """{"quotaRemainingToday": 500}"""
            }.andExpect {
                status { isNoContent() }
            }

        val runner = runnerRepository.findById(runnerId).get()
        assert(runner.quotaRemainingToday == 500L)
        assert(runner.lastSeenAt != null)
    }

    @Test
    fun `POST runners-id-heartbeat with wrong token returns 500`() {
        val registerResponse =
            mockMvc
                .post("/runners/register") {
                    contentType = MediaType.APPLICATION_JSON
                    content = """{"contributorName": "Dave"}"""
                }.andReturn()
                .response.contentAsString

        val runnerId = registerResponse.substringAfter("\"runnerId\":\"").substringBefore("\"")

        mockMvc
            .post("/runners/$runnerId/heartbeat") {
                contentType = MediaType.APPLICATION_JSON
                header("X-Runner-Token", "wrong-token")
                content = """{"quotaRemainingToday": 100}"""
            }.andExpect {
                status { is5xxServerError() }
            }
    }
}
