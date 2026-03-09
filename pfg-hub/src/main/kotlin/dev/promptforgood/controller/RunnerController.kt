package dev.promptforgood.controller

import dev.promptforgood.api.RunnersApi
import dev.promptforgood.api.model.HeartbeatRequest
import dev.promptforgood.api.model.RegisterRequest
import dev.promptforgood.api.model.RegisterResponse
import dev.promptforgood.service.RunnerService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RestController

@RestController
class RunnerController(
    private val runnerService: RunnerService,
) : RunnersApi {
    override fun registerRunner(registerRequest: RegisterRequest): ResponseEntity<RegisterResponse> {
        val runner = runnerService.register(registerRequest.contributorName)
        return ResponseEntity.ok(RegisterResponse(runnerId = runner.id, token = runner.token))
    }

    override fun heartbeat(
        id: String,
        xRunnerToken: String,
        heartbeatRequest: HeartbeatRequest,
    ): ResponseEntity<Void> {
        runnerService.heartbeat(id, xRunnerToken, heartbeatRequest.quotaRemainingToday)
        return ResponseEntity.noContent().build()
    }
}
