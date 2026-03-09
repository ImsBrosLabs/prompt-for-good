package dev.promptforgood.controller

import dev.promptforgood.service.RunnerService
import io.swagger.v3.oas.annotations.Operation
import io.swagger.v3.oas.annotations.Parameter
import io.swagger.v3.oas.annotations.media.Content
import io.swagger.v3.oas.annotations.media.Schema
import io.swagger.v3.oas.annotations.responses.ApiResponse
import io.swagger.v3.oas.annotations.responses.ApiResponses
import io.swagger.v3.oas.annotations.security.SecurityRequirement
import io.swagger.v3.oas.annotations.tags.Tag
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.PathVariable
import org.springframework.web.bind.annotation.PostMapping
import org.springframework.web.bind.annotation.RequestBody
import org.springframework.web.bind.annotation.RequestHeader
import org.springframework.web.bind.annotation.RequestMapping
import org.springframework.web.bind.annotation.RestController

@RestController
@RequestMapping("/runners")
@Tag(name = "Runners", description = "Runner lifecycle — registration and heartbeat")
class RunnerController(
    private val runnerService: RunnerService,
) {
    @Operation(
        summary = "Register a new runner",
        description = "Creates a runner entry and returns a permanent token to use for all subsequent requests.",
    )
    @ApiResponses(
        ApiResponse(
            responseCode = "200",
            description = "Runner registered successfully",
            content = [Content(schema = Schema(implementation = RegisterResponse::class))],
        ),
        ApiResponse(responseCode = "400", description = "Missing or invalid contributor name"),
    )
    @PostMapping("/register")
    fun register(
        @RequestBody body: RegisterRequest,
    ): ResponseEntity<RegisterResponse> {
        val runner = runnerService.register(body.contributorName)
        return ResponseEntity.ok(RegisterResponse(runnerId = runner.id, token = runner.token))
    }

    @Operation(
        summary = "Send heartbeat",
        description = "Signals the runner is alive and updates its remaining daily token quota. Must be called at least every 30 minutes.",
    )
    @ApiResponses(
        ApiResponse(responseCode = "204", description = "Heartbeat recorded"),
        ApiResponse(responseCode = "401", description = "Invalid or missing runner token"),
        ApiResponse(responseCode = "404", description = "Runner not found"),
    )
    @SecurityRequirement(name = "RunnerToken")
    @PostMapping("/{id}/heartbeat")
    fun heartbeat(
        @Parameter(description = "Runner UUID", required = true) @PathVariable id: String,
        @Parameter(description = "Runner authentication token", required = true)
        @RequestHeader("X-Runner-Token") runnerToken: String,
        @RequestBody body: HeartbeatRequest,
    ): ResponseEntity<Void> {
        runnerService.heartbeat(id, runnerToken, body.quotaRemainingToday)
        return ResponseEntity.noContent().build()
    }
}

@Schema(description = "Runner registration request")
data class RegisterRequest(
    @field:Schema(description = "GitHub username or display name of the contributor", example = "octocat")
    val contributorName: String,
)

@Schema(description = "Runner registration response containing the authentication token")
data class RegisterResponse(
    @field:Schema(description = "Generated UUID identifying this runner", example = "a1b2c3d4-...")
    val runnerId: String,
    @field:Schema(description = "Permanent bearer token to pass as X-Runner-Token header", example = "e5f6g7h8-...")
    val token: String,
)

@Schema(description = "Heartbeat payload")
data class HeartbeatRequest(
    @field:Schema(description = "Claude API tokens remaining in the runner's daily quota", example = "50000")
    val quotaRemainingToday: Long,
)
