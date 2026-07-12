import { BadRequestException, PipeTransform } from "@nestjs/common";
import { z, ZodType } from "zod";
import { issueDifficulties } from "../openapi/dtos";

const githubPullRequestUrlPattern =
  /^https:\/\/github\.com\/[A-Za-z0-9_.-]+\/[A-Za-z0-9_.-]+\/pull\/[1-9]\d*$/;

const runnerPreferencesSchema = z
  .object({
    allowedRepos: z.array(z.string()).optional(),
    blockedRepos: z.array(z.string()).optional(),
    languages: z.array(z.string()).optional(),
    ecosystems: z.array(z.string()).optional(),
    licenses: z.array(z.string()).optional(),
    labels: z.array(z.string()).optional(),
    maxDifficulty: z.enum(issueDifficulties).optional(),
    maxEstimatedMinutes: z.number().int().nonnegative().optional(),
  })
  .strict();

export const registerRequestSchema = z
  .object({
    contributorName: z.string(),
    preferences: runnerPreferencesSchema.optional(),
  })
  .strict();

export const heartbeatRequestSchema = z
  .object({
    quotaRemainingToday: z.number().int().nonnegative(),
    preferences: runnerPreferencesSchema.optional(),
  })
  .strict();

export const doneRequestSchema = z
  .object({
    success: z.boolean(),
    prUrl: z.string().regex(githubPullRequestUrlPattern).nullable().optional(),
    tokensUsed: z.number().int().nonnegative().nullable().optional(),
    errorMessage: z.string().nullable().optional(),
    details: z.record(z.string(), z.json()).nullable().optional(),
  })
  .strict()
  .superRefine((request, context) => {
    if (request.success && !request.prUrl) {
      context.addIssue({
        code: "custom",
        message: "prUrl is required when success is true",
        path: ["prUrl"],
      });
    }
  });

export class ZodValidationPipe<T> implements PipeTransform<unknown, T> {
  constructor(private readonly schema: ZodType<T>) {}

  /** Rejects malformed API bodies before controllers pass data into services. */
  transform(value: unknown): T {
    const parsed = this.schema.safeParse(value);
    if (!parsed.success) {
      throw new BadRequestException("Invalid request body");
    }
    return parsed.data;
  }
}
