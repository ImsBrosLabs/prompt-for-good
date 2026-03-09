package dev.promptforgood.service

import dev.promptforgood.model.Runner
import dev.promptforgood.repository.RunnerRepository
import org.springframework.stereotype.Service
import org.springframework.transaction.annotation.Transactional
import java.time.Instant
import java.util.UUID

@Service
class RunnerService(
    private val runnerRepository: RunnerRepository,
) {
    @Transactional
    fun register(contributorName: String): Runner {
        val token = UUID.randomUUID().toString()
        val runner =
            Runner(
                token = token,
                contributorName = contributorName,
                active = true,
            )
        return runnerRepository.save(runner)
    }

    @Transactional
    fun heartbeat(
        id: String,
        token: String,
        quotaRemaining: Long,
    ) {
        val runner = runnerRepository.findById(id).orElseThrow { RuntimeException("Runner not found") }
        if (runner.token != token) throw RuntimeException("Invalid token")

        val updatedRunner =
            runner.copy(
                quotaRemainingToday = quotaRemaining,
                lastSeenAt = Instant.now(),
                active = true,
            )
        runnerRepository.save(updatedRunner)
    }
}
