package dev.promptforgood.model

import jakarta.persistence.Column
import jakarta.persistence.Entity
import jakarta.persistence.GeneratedValue
import jakarta.persistence.GenerationType
import jakarta.persistence.Id
import jakarta.persistence.Table
import java.time.Instant

@Entity
@Table(name = "repos")
data class Repo(
    @Id
    @GeneratedValue(strategy = GenerationType.UUID)
    val id: String = "",
    @Column(nullable = false, unique = true)
    val githubUrl: String = "",
    @Column(nullable = false)
    val owner: String = "",
    @Column(nullable = false)
    val name: String = "",
    val language: String? = null,
    @Column(nullable = false)
    val score: Int = 0,
    val stars: Int = 0,
    @Column(nullable = false)
    val eligible: Boolean = false,
    val lastCrawledAt: Instant? = null,
    @Column(nullable = false)
    val createdAt: Instant = Instant.now(),
)
