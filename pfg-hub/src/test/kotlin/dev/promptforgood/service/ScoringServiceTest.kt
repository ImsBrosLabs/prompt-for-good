package dev.promptforgood.service

import dev.promptforgood.model.Issue
import dev.promptforgood.model.IssueStatus
import dev.promptforgood.model.Repo
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertFalse
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test

class ScoringServiceTest {
    private val scoringService = ScoringService()

    private fun issue(
        labels: String = "",
        body: String? = null,
    ) = Issue(
        repo = Repo(),
        githubId = 1,
        title = "Test",
        body = body,
        githubUrl = "https://github.com/owner/repo/issues/1",
        labels = labels,
        status = IssueStatus.PENDING,
    )

    private fun repo(stars: Int) = Repo(stars = stars)

    // -------------------------------------------------------------------------
    // scoreIssue — label scoring
    // -------------------------------------------------------------------------

    @Test
    fun `scoreIssue returns 0 for empty labels and no body`() {
        assertEquals(0, scoringService.scoreIssue(issue()))
    }

    @Test
    fun `scoreIssue adds 25 for good first issue label`() {
        assertEquals(25, scoringService.scoreIssue(issue("good first issue")))
    }

    @Test
    fun `scoreIssue adds 15 for bug label`() {
        assertEquals(15, scoringService.scoreIssue(issue("bug")))
    }

    @Test
    fun `scoreIssue adds 10 for help wanted label`() {
        assertEquals(10, scoringService.scoreIssue(issue("help wanted")))
    }

    @Test
    fun `scoreIssue adds 30 for pfg-eligible label`() {
        assertEquals(30, scoringService.scoreIssue(issue("pfg-eligible")))
    }

    @Test
    fun `scoreIssue is case-insensitive for label matching`() {
        assertEquals(25, scoringService.scoreIssue(issue("GOOD FIRST ISSUE")))
    }

    @Test
    fun `scoreIssue accumulates points from multiple labels`() {
        // good first issue(25) + bug(15) = 40
        assertEquals(40, scoringService.scoreIssue(issue("good first issue,bug")))
    }

    @Test
    fun `scoreIssue accumulates all four label bonuses`() {
        // pfg-eligible(30) + good first issue(25) + bug(15) + help wanted(10) = 80
        assertEquals(80, scoringService.scoreIssue(issue("pfg-eligible,good first issue,bug,help wanted")))
    }

    // -------------------------------------------------------------------------
    // scoreIssue — description scoring
    // -------------------------------------------------------------------------

    @Test
    fun `scoreIssue adds 10 for description longer than 200 chars`() {
        assertEquals(10, scoringService.scoreIssue(issue(body = "a".repeat(201))))
    }

    @Test
    fun `scoreIssue does not add description bonus for body of exactly 200 chars`() {
        assertEquals(0, scoringService.scoreIssue(issue(body = "a".repeat(200))))
    }

    @Test
    fun `scoreIssue adds 10 when body contains both expected and actual`() {
        assertEquals(10, scoringService.scoreIssue(issue(body = "Expected: X, Actual: Y")))
    }

    @Test
    fun `scoreIssue does not add points when only expected is present`() {
        assertEquals(0, scoringService.scoreIssue(issue(body = "Expected: something")))
    }

    @Test
    fun `scoreIssue does not add points when only actual is present`() {
        assertEquals(0, scoringService.scoreIssue(issue(body = "Actual: something")))
    }

    @Test
    fun `scoreIssue adds 15 for body containing reproduce`() {
        assertEquals(15, scoringService.scoreIssue(issue(body = "Steps to reproduce the issue")))
    }

    @Test
    fun `scoreIssue adds 15 for body containing failing test`() {
        assertEquals(15, scoringService.scoreIssue(issue(body = "There is a failing test")))
    }

    @Test
    fun `scoreIssue is case-insensitive for description quality signals`() {
        assertEquals(15, scoringService.scoreIssue(issue(body = "REPRODUCE")))
    }

    @Test
    fun `scoreIssue awards both reproduce and expected+actual bonuses when both present`() {
        val body = "Steps to Reproduce: do X. Expected: Y, Actual: Z"
        assertEquals(25, scoringService.scoreIssue(issue(body = body)))
    }

    // -------------------------------------------------------------------------
    // scoreIssue — boundary / capping
    // -------------------------------------------------------------------------

    @Test
    fun `scoreIssue caps score at 100`() {
        // pfg-eligible(30)+good first issue(25)+bug(15)+help wanted(10)+body>200(10)+expected+actual(10)+reproduce(15) = 115
        val body = "a".repeat(201) + " Expected Actual Reproduce"
        val labels = "pfg-eligible,good first issue,bug,help wanted"
        assertEquals(100, scoringService.scoreIssue(issue(labels, body)))
    }

    @Test
    fun `scoreIssue never returns negative score`() {
        assertTrue(scoringService.scoreIssue(issue()) >= 0)
    }

    @Test
    fun `scoreIssue handles null body gracefully`() {
        assertEquals(0, scoringService.scoreIssue(issue(body = null)))
    }

    // -------------------------------------------------------------------------
    // isRepoEligible
    // -------------------------------------------------------------------------

    @Test
    fun `isRepoEligible returns true for repo with exactly 50 stars`() {
        assertTrue(scoringService.isRepoEligible(repo(50)))
    }

    @Test
    fun `isRepoEligible returns true for repo with more than 50 stars`() {
        assertTrue(scoringService.isRepoEligible(repo(1000)))
    }

    @Test
    fun `isRepoEligible returns false for repo with 49 stars`() {
        assertFalse(scoringService.isRepoEligible(repo(49)))
    }

    @Test
    fun `isRepoEligible returns false for repo with 0 stars`() {
        assertFalse(scoringService.isRepoEligible(repo(0)))
    }
}
