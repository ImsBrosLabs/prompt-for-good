import { Controller, Get } from "@nestjs/common";
import { components } from "../types/openapi";
import { StatsService } from "./stats.service";

type StatsResponse = components["schemas"]["StatsResponse"];

@Controller("stats")
export class StatsController {
  constructor(private readonly statsService: StatsService) {}

  @Get()
  async getStats(): Promise<StatsResponse> {
    return this.statsService.getStats();
  }
}
