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
