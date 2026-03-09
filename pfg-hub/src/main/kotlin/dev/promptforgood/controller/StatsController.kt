package dev.promptforgood.controller

import dev.promptforgood.api.StatsApi
import dev.promptforgood.api.model.StatsResponse
import dev.promptforgood.service.StatsService
import org.springframework.http.ResponseEntity
import org.springframework.web.bind.annotation.RestController

@RestController
class StatsController(
    private val statsService: StatsService,
) : StatsApi {

    override fun getStats(): ResponseEntity<StatsResponse> =
        ResponseEntity.ok(statsService.getStats())
}
