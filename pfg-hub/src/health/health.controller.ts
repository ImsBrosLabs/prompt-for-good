import { Controller, Get } from "@nestjs/common";

@Controller("actuator")
export class HealthController {
  @Get("health")
  health() {
    return { status: "UP" };
  }
}
