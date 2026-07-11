import { Injectable } from "@nestjs/common";

export type DispatchMetricsSnapshot = {
  sampleCount: number;
  lastMatchingLatencyMs: number | null;
  averageMatchingLatencyMs: number | null;
  p95MatchingLatencyMs: number | null;
};

const MAX_SAMPLES = 200;

@Injectable()
export class DispatchMetricsService {
  private readonly latenciesMs: number[] = [];

  /** Records bounded matching latency samples for operational queue health stats. */
  recordMatchingLatency(latencyMs: number): void {
    this.latenciesMs.push(Math.max(0, Math.round(latencyMs)));
    if (this.latenciesMs.length > MAX_SAMPLES) {
      this.latenciesMs.splice(0, this.latenciesMs.length - MAX_SAMPLES);
    }
  }

  /** Summarizes recent matching latency without exposing the full in-memory sample set. */
  snapshot(): DispatchMetricsSnapshot {
    if (this.latenciesMs.length === 0) {
      return {
        sampleCount: 0,
        lastMatchingLatencyMs: null,
        averageMatchingLatencyMs: null,
        p95MatchingLatencyMs: null,
      };
    }

    const sorted = [...this.latenciesMs].sort((left, right) => left - right);
    const sum = this.latenciesMs.reduce((total, value) => total + value, 0);
    const p95Index = Math.min(
      sorted.length - 1,
      Math.ceil(sorted.length * 0.95) - 1,
    );

    return {
      sampleCount: this.latenciesMs.length,
      lastMatchingLatencyMs: this.latenciesMs[this.latenciesMs.length - 1],
      averageMatchingLatencyMs: Math.round(sum / this.latenciesMs.length),
      p95MatchingLatencyMs: sorted[p95Index],
    };
  }
}
