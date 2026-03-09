package dev.promptforgood.model

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.EnumType
import jakarta.persistence.Enumerated
import jakarta.persistence.FetchType
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.JoinColumn
import jakarta.persistence.ManyToOne
import jakarta.persistence.Table
import java.time.Instant

enum class IssueStatus {
    PENDING,
    CLAIMED,
    DONE,
    FAILED,
}

@Entity
@Table(name = "issues")
data class Issue(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: String = "",
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "repo_id", nullable = false)
    val repo: Repo = Repo(),
    @Column(nullable = false)
    val githubId: Long = 0,
    @Column(nullable = false)
    val title: String = "",
    @Column(columnDefinition = "TEXT")
    val body: String? = null,
    @Column(nullable = false)
    val githubUrl: String = "",
    val labels: String = "", // comma-separated
    @Column(nullable = false)
    val score: Int = 0,
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    val status: IssueStatus = IssueStatus.PENDING,
    val claimedBy: String? = null, // runner id
    val claimedAt: Instant? = null,
    @Column(nullable = false)
    val retryCount: Int = 0,
    @Column(nullable = false)
    val createdAt: Instant = Instant.now(),
    val updatedAt: Instant = Instant.now(),
)
