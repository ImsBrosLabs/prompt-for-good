package dev.promptforgood.service

import dev.promptforgood.model.Runner
import dev.promptforgood.repository.RunnerRepository
import io.mockk.every
import io.mockk.mockk
import io.mockk.verify
import org.junit.jupiter.api.Assertions.assertEquals
import org.junit.jupiter.api.Assertions.assertNotEquals
import org.junit.jupiter.api.Assertions.assertTrue
import org.junit.jupiter.api.Test
import org.junit.jupiter.api.assertThrows
import java.util.Optional

class RunnerServiceTest {
    private val runnerRepository = mockk<RunnerRepository>()
    private val runnerService = RunnerService(runnerRepository)

    // -------------------------------------------------------------------------
    // register
    // -------------------------------------------------------------------------

    @Test
    fun `register creates and saves a runner with the given contributor name`() {
        every { runnerRepository.save(any()) } answers { firstArg() }

        val result = runnerService.register("Alice")

        assertEquals("Alice", result.contributorName)
        assertTrue(result.active)
        verify { runnerRepository.save(match { it.contributorName == "Alice" }) }
    }

    @Test
    fun `register generates a non-blank UUID token`() {
        every { runnerRepository.save(any()) } answers { firstArg() }

        val result = runnerService.register("Bob")

        assertTrue(result.token.isNotBlank())
        // UUID format: 8-4-4-4-12 hex chars
        assertTrue(result.token.matches(Regex("[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}")))
    }

    @Test
    fun `register generates unique tokens across multiple calls`() {
        every { runnerRepository.save(any()) } answers { firstArg() }

        val first = runnerService.register("Alice")
        val second = runnerService.register("Alice")

        assertNotEquals(first.token, second.token)
    }

    // -------------------------------------------------------------------------
    // heartbeat
    // -------------------------------------------------------------------------

    @Test
    fun `heartbeat updates quotaRemainingToday and sets lastSeenAt`() {
        val runner = Runner(id = "r-1", token = "tok", contributorName = "Alice")
        every { runnerRepository.findById("r-1") } returns Optional.of(runner)
        every { runnerRepository.save(any()) } answers { firstArg() }

        runnerService.heartbeat("r-1", "tok", 500)

        verify {
            runnerRepository.save(
                match { it.quotaRemainingToday == 500L && it.lastSeenAt != null && it.active },
            )
        }
    }

    @Test
    fun `heartbeat sets runner active to true`() {
        val runner = Runner(id = "r-1", token = "tok", contributorName = "Alice", active = false)
        every { runnerRepository.findById("r-1") } returns Optional.of(runner)
        every { runnerRepository.save(any()) } answers { firstArg() }

        runnerService.heartbeat("r-1", "tok", 0)

        verify { runnerRepository.save(match { it.active }) }
    }

    @Test
    fun `heartbeat throws RuntimeException when runner is not found`() {
        every { runnerRepository.findById("missing") } returns Optional.empty()

        assertThrows<RuntimeException> { runnerService.heartbeat("missing", "tok", 100) }
    }

    @Test
    fun `heartbeat throws RuntimeException when token does not match`() {
        val runner = Runner(id = "r-1", token = "correct-token", contributorName = "Alice")
        every { runnerRepository.findById("r-1") } returns Optional.of(runner)

        assertThrows<RuntimeException> { runnerService.heartbeat("r-1", "wrong-token", 100) }
    }

    @Test
    fun `heartbeat stores the exact quota value provided`() {
        val runner = Runner(id = "r-1", token = "tok", contributorName = "Alice", quotaRemainingToday = 1000)
        every { runnerRepository.findById("r-1") } returns Optional.of(runner)
        every { runnerRepository.save(any()) } answers { firstArg() }

        runnerService.heartbeat("r-1", "tok", 42)

        verify { runnerRepository.save(match { it.quotaRemainingToday == 42L }) }
    }

    @Test
    fun `heartbeat accepts zero quota remaining`() {
        val runner = Runner(id = "r-1", token = "tok", contributorName = "Alice")
        every { runnerRepository.findById("r-1") } returns Optional.of(runner)
        every { runnerRepository.save(any()) } answers { firstArg() }

        runnerService.heartbeat("r-1", "tok", 0)

        verify { runnerRepository.save(match { it.quotaRemainingToday == 0L }) }
    }
}
