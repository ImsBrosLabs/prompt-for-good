package dev.promptforgood.controller

import dev.promptforgood.service.RunnerService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/runners")
class RunnerController(
    private val runnerService: RunnerService,
) {
    /** Register a new runner. Returns a token used for subsequent requests. */
    @PostMapping("/register")
    fun register(
        @RequestBody body: RegisterRequest,
    ): ResponseEntity<RegisterResponse> {
        val runner = runnerService.register(body.contributorName)
        return ResponseEntity.ok(RegisterResponse(runnerId = runner.id, token = runner.token))
    }

    /** Runner signals it is alive and updates its quota. */
    @PostMapping("/{id}/heartbeat")
    fun heartbeat(
        @PathVariable id: String,
        @RequestHeader("X-Runner-Token") runnerToken: String,
        @RequestBody body: HeartbeatRequest,
    ): ResponseEntity<Void> {
        runnerService.heartbeat(id, runnerToken, body.quotaRemainingToday)
        return ResponseEntity.noContent().build()
    }
}

data class RegisterRequest(
    val contributorName: String,
)

data class RegisterResponse(
    val runnerId: String,
    val token: String,
)

data class HeartbeatRequest(
    val quotaRemainingToday: Long,
)
