import { BadRequestException } from "@nestjs/common";
import { describe, expect, it } from "vitest";
import {
  doneRequestSchema,
  heartbeatRequestSchema,
  registerRequestSchema,
  ZodValidationPipe,
} from "../src/validation/request-validation";

describe("request validation", () => {
  it("accepts structured runner preferences and rejects unknown fields", () => {
    expect(
      registerRequestSchema.safeParse({
        contributorName: "octocat",
        preferences: {
          languages: ["typescript"],
          maxDifficulty: "medium",
          maxEstimatedMinutes: 120,
        },
      }).success,
    ).toBe(true);

    expect(
      registerRequestSchema.safeParse({
        contributorName: "octocat",
        preferences: { language: "typescript" },
      }).success,
    ).toBe(false);
    expect(
      registerRequestSchema.safeParse({
        contributorName: "octocat",
        preferences: { maxEstimatedMinutes: -1 },
      }).success,
    ).toBe(false);
  });

  it("requires heartbeat quota to be a non-negative integer number", () => {
    expect(
      heartbeatRequestSchema.safeParse({ quotaRemainingToday: 0 }).success,
    ).toBe(true);
    expect(
      heartbeatRequestSchema.safeParse({ quotaRemainingToday: 250 }).success,
    ).toBe(true);
    expect(heartbeatRequestSchema.safeParse({}).success).toBe(false);
    expect(
      heartbeatRequestSchema.safeParse({ quotaRemainingToday: -1 }).success,
    ).toBe(false);
    expect(
      heartbeatRequestSchema.safeParse({ quotaRemainingToday: "250" }).success,
    ).toBe(false);
  });

  it("requires successful completions to include a GitHub pull request URL", () => {
    expect(
      doneRequestSchema.safeParse({
        success: true,
        prUrl: "https://github.com/owner/repo/pull/7",
        tokensUsed: 123,
      }).success,
    ).toBe(true);
    expect(doneRequestSchema.safeParse({ success: true }).success).toBe(false);
    expect(
      doneRequestSchema.safeParse({
        success: true,
        prUrl: "https://github.com/owner/repo/issues/7",
      }).success,
    ).toBe(false);
  });

  it("allows failed completions without PR URLs while validating optional counts", () => {
    expect(doneRequestSchema.safeParse({ success: false }).success).toBe(true);
    expect(
      doneRequestSchema.safeParse({
        success: false,
        tokensUsed: null,
        errorMessage: "Tests failed",
        details: {
          verification: {
            status: "failed",
            command: ["npm", "test", "--silent"],
            timedOut: false,
          },
        },
      }).success,
    ).toBe(true);
    expect(
      doneRequestSchema.safeParse({
        success: false,
        tokensUsed: -1,
      }).success,
    ).toBe(false);
  });

  it("rejects non-json completion details", () => {
    expect(
      doneRequestSchema.safeParse({
        success: false,
        details: { invalid: undefined },
      }).success,
    ).toBe(false);
  });

  it("turns schema failures into BadRequestException responses", () => {
    const pipe = new ZodValidationPipe(heartbeatRequestSchema);

    expect(() => pipe.transform({ quotaRemainingToday: -1 })).toThrow(
      BadRequestException,
    );
  });
});
