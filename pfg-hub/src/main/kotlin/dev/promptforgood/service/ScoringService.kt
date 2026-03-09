package dev.promptforgood.service

import dev.promptforgood.model.Issue
import dev.promptforgood.model.Repo
import org.springframework.stereotype.Service

@Service
class ScoringService {
    /**
     * Scores an issue based on ADR-002 criteria.
     * Scale: 0-100.
     */
    fun scoreIssue(issue: Issue): Int {
        var score = 0
        val labels = issue.labels.lowercase()

        // Labels
        if (labels.contains("good first issue")) score += 25
        if (labels.contains("bug")) score += 15
        if (labels.contains("help wanted")) score += 10
        if (labels.contains("pfg-eligible")) score += 30

        // Description
        val body = issue.body ?: ""
        if (body.length > 200) score += 10
        if (body.contains("expected", ignoreCase = true) && body.contains("actual", ignoreCase = true)) {
            score += 10
        }

        // Quality signals
        if (body.contains("reproduce", ignoreCase = true) || body.contains("failing test", ignoreCase = true)) {
            score += 15
        }

        return score.coerceIn(0, 100)
    }

    /**
     * Scores a repository for eligibility.
     */
    fun isRepoEligible(repo: Repo): Boolean {
        // Initial simplified logic: stars > 50
        return repo.stars >= 50
    }
}
