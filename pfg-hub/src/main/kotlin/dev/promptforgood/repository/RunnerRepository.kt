package dev.promptforgood.repository

import dev.promptforgood.model.Runner
import org.springframework.data.jpa.repository.JpaRepository
import org.springframework.stereotype.Repository

@Repository
interface RunnerRepository : JpaRepository<Runner, String> {
    fun findByToken(token: String): Runner?

    fun countByActiveTrue(): Long
}
