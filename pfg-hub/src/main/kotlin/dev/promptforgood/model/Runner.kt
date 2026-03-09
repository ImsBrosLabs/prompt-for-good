package dev.promptforgood.model

import jakarta.persistence.*
import java.time.Instant

@Entity
@Table(name = "runners")
data class Runner(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: String = "",

    @Column(nullable = false, unique = true)
    val token: String = "",

    @Column(nullable = false)
    val contributorName: String = "",

    val quotaRemainingToday: Long = 0,

    val lastSeenAt: Instant? = null,

    @Column(nullable = false)
    val active: Boolean = true,

    @Column(nullable = false)
    val createdAt: Instant = Instant.now(),
)
