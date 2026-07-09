import {
  BadRequestException,
  NotFoundException,
  UnauthorizedException,
} from "@nestjs/common";
import { describe, expect, it, vi } from "vitest";
import { Database } from "../src/db/database.module";
import { Runner } from "../src/db/schema";
import { RunnersService } from "../src/runners/runners.service";

const runner: Runner = {
  id: "runner-1",
  token: "token-1",
  contributorName: "octocat",
  quotaRemainingToday: 0,
  lastSeenAt: null,
  active: true,
  preferences: {},
  createdAt: new Date("2026-01-01T00:00:00Z"),
};

function createInsertDb(returningRows: Runner[]) {
  const returning = vi.fn(async () => returningRows);
  const values = vi.fn((_value: Record<string, unknown>) => ({ returning }));
  const insert = vi.fn((_table: unknown) => ({ values }));

  return {
    db: { insert } as unknown as Database,
    insert,
    values,
    returning,
  };
}

function createSelectDb(selectRows: Runner[]) {
  const limit = vi.fn(async () => selectRows);
  const where = vi.fn((_condition: unknown) => ({ limit }));
  const from = vi.fn((_table: unknown) => ({ where }));
  const select = vi.fn(() => ({ from }));

  return {
    db: { select } as unknown as Database,
    select,
    from,
    where,
    limit,
  };
}

function createRunnerDb(selectRows: Runner[]) {
  const selectDb = createSelectDb(selectRows);
  const updateWhere = vi.fn(async (_condition: unknown) => undefined);
  const set = vi.fn((_value: Record<string, unknown>) => ({
    where: updateWhere,
  }));
  const update = vi.fn((_table: unknown) => ({ set }));

  return {
    db: {
      select: selectDb.select,
      update,
    } as unknown as Database,
    set,
    updateWhere,
  };
}

describe("RunnersService", () => {
  // A runner cannot be registered without a real contributor name, because the
  // hub uses that identity to attribute future contributions.
  it("rejects blank contributor names", async () => {
    const { db } = createInsertDb([]);
    const service = new RunnersService(db);

    await expect(service.register("   ")).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  // Registration normalizes user input before persisting it and always creates
  // an active runner that can immediately claim work.
  it("trims contributor names and creates an active runner", async () => {
    const { db, values } = createInsertDb([runner]);
    const service = new RunnersService(db);

    await expect(service.register("  octocat  ")).resolves.toBe(runner);

    expect(values).toHaveBeenCalledWith(
      expect.objectContaining({
        contributorName: "octocat",
        active: true,
      }),
    );
  });

  // Token validation must fail both when the caller provides no token and when
  // the token is syntactically present but unknown to the hub.
  it("rejects missing and unknown runner tokens", async () => {
    const { db } = createSelectDb([]);
    const service = new RunnersService(db);

    await expect(service.validateToken("")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
    await expect(service.validateToken("unknown")).rejects.toBeInstanceOf(
      UnauthorizedException,
    );
  });

  // A known token resolves to its runner record; downstream services rely on
  // this to authorize issue claims and reports.
  it("returns the runner for a valid token", async () => {
    const { db } = createSelectDb([runner]);
    const service = new RunnersService(db);

    await expect(service.validateToken("token-1")).resolves.toBe(runner);
  });

  // Heartbeats are accepted only for existing runners and only when the token
  // belongs to that exact runner id.
  it("requires the heartbeat runner to exist and own the token", async () => {
    const missing = new RunnersService(createRunnerDb([]).db);
    await expect(
      missing.heartbeat("runner-1", "token-1", 10),
    ).rejects.toBeInstanceOf(NotFoundException);

    const wrongToken = new RunnersService(createRunnerDb([runner]).db);
    await expect(
      wrongToken.heartbeat("runner-1", "wrong-token", 10),
    ).rejects.toBeInstanceOf(UnauthorizedException);
  });

  // A valid heartbeat updates runner liveness and quota information so the hub
  // can track available capacity.
  it("records heartbeat quota and marks the runner active", async () => {
    const { db, set, updateWhere } = createRunnerDb([runner]);
    const service = new RunnersService(db);

    await service.heartbeat("runner-1", "token-1", 250);

    expect(set).toHaveBeenCalledWith(
      expect.objectContaining({
        quotaRemainingToday: 250,
        lastSeenAt: expect.any(Date),
        active: true,
      }),
    );
    expect(updateWhere).toHaveBeenCalledOnce();
  });
});
