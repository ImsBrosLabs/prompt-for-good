package dev.promptforgood.model

import jakarta.persistence.*
import java.time.Instant

enum class ContributionStatus {
    SUCCESS,
    FAILED,
}

@Entity
@Table(name = "contributions")
data class Contribution(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: String = "",
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "issue_id", nullable = false)
    val issue: Issue = Issue(),
    @ManyToOne(fetch = FetchType.LAZY)
    @JoinColumn(name = "runner_id", nullable = false)
    val runner: Runner = Runner(),
    val prUrl: String? = null,
    @Enumerated(EnumType.STRING)
    @Column(nullable = false)
    val status: ContributionStatus = ContributionStatus.FAILED,
    val tokensUsed: Long? = null,
    val errorMessage: String? = null,
    @Column(nullable = false)
    val createdAt: Instant = Instant.now(),
)
