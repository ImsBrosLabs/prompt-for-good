import { BadRequestException } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { describe, expect, it, vi } from "vitest";
import { Database } from "../src/db/database.module";
import { RuntimeConfigOverride } from "../src/db/schema";
import { RuntimeConfigKey } from "../src/runtime-config/runtime-config.catalog";
import { RuntimeConfigService } from "../src/runtime-config/runtime-config.service";

function createSelectChain(options: {
  listRows?: RuntimeConfigOverride[];
  lookupRows?: RuntimeConfigOverride[][];
}) {
  const lookupRows = [...(options.lookupRows ?? [])];
  const limit = vi.fn(async () => lookupRows.shift() ?? []);
  const where = vi.fn((_condition: unknown) => ({ limit }));
  const fromResult = {
    where,
    then<TResult1 = RuntimeConfigOverride[], TResult2 = never>(
      onfulfilled?:
        | ((value: RuntimeConfigOverride[]) => TResult1 | PromiseLike<TResult1>)
        | null,
      onrejected?:
        ((reason: unknown) => TResult2 | PromiseLike<TResult2>) | null,
    ) {
      return Promise.resolve(options.listRows ?? []).then(
        onfulfilled,
        onrejected,
      );
    },
  };
  const from = vi.fn((_table: unknown) => fromResult);
  const select = vi.fn(() => ({ from }));

  return { select, from, where, limit };
}

function createInsertChain() {
  const onConflictDoUpdate = vi.fn(async (_value: unknown) => undefined);
  const values = vi.fn((_value: unknown) => ({ onConflictDoUpdate }));
  const insert = vi.fn((_table: unknown) => ({ values }));
  return { insert, values, onConflictDoUpdate };
}

function createDeleteChain() {
  const where = vi.fn(async (_condition: unknown) => undefined);
  const deleteFn = vi.fn((_table: unknown) => ({ where }));
  return { deleteFn, where };
}

function createService(
  options: {
    env?: Record<string, string | undefined>;
    listRows?: RuntimeConfigOverride[];
    lookupRows?: RuntimeConfigOverride[][];
  } = {},
) {
  const select = createSelectChain({
    listRows: options.listRows,
    lookupRows: options.lookupRows,
  });
  const insert = createInsertChain();
  const deleteChain = createDeleteChain();
  const db = {
    select: select.select,
    insert: insert.insert,
    delete: deleteChain.deleteFn,
  } as unknown as Database;
  const configService = {
    get: vi.fn((key: string) => options.env?.[key]),
  } as unknown as ConfigService;

  return {
    service: new RuntimeConfigService(db, configService),
    select,
    insert,
    deleteChain,
    configService,
  };
}

function override(
  key: RuntimeConfigKey,
  value: RuntimeConfigOverride["value"],
): RuntimeConfigOverride {
  return {
    key,
    value,
    updatedAt: new Date("2026-01-01T00:00:00Z"),
    updatedBy: "admin",
  };
}

describe("RuntimeConfigService", () => {
  it("falls back to the catalog default when no override or env value exists", async () => {
    const { service } = createService({ lookupRows: [[]] });

    await expect(service.get("issueMaxRetries")).resolves.toBe(3);
  });

  it("uses the environment before the catalog default", async () => {
    const { service } = createService({
      env: { ISSUE_MAX_RETRIES: "7" },
      lookupRows: [[]],
    });

    await expect(service.get("issueMaxRetries")).resolves.toBe(7);
  });

  it("uses the database override before the environment", async () => {
    const { service } = createService({
      env: { ISSUE_MAX_RETRIES: "7" },
      lookupRows: [[override("issueMaxRetries", 9)]],
    });

    await expect(service.get("issueMaxRetries")).resolves.toBe(9);
  });

  it("lists every catalog entry while keeping secret values hidden", async () => {
    const { service } = createService({
      env: {
        ADMIN_KEY: "env-admin-key",
        PFG_GITHUB_TOKEN: "env-github-token",
        ISSUE_MAX_RETRIES: "7",
        ISSUE_MIN_SCORE: "70",
      },
      listRows: [override("issueMaxRetries", 5)],
    });

    const items = await service.list();
    const keys = items.map((item) => item.key);

    expect(keys).toContain("issueMaxRetries");
    expect(keys).toContain("issueMinScore");
    expect(keys).toContain("databaseUrl");
    expect(keys).toContain("adminKey");
    expect(keys).toContain("githubToken");
    expect(items.find((item) => item.key === "issueMaxRetries")).toMatchObject({
      value: 5,
      environmentValue: "7",
      source: "database",
      hasDatabaseOverride: true,
    });
    expect(items.find((item) => item.key === "issueMinScore")).toMatchObject({
      value: 70,
      environmentValue: "70",
      source: "environment",
      hasDatabaseOverride: false,
    });
    expect(items.find((item) => item.key === "adminKey")).toMatchObject({
      value: null,
      environmentValue: null,
      source: "environment",
      hasDatabaseOverride: false,
      metadata: { secret: true, defaultValue: null },
    });
  });

  it("persists secret database overrides without echoing secret values", async () => {
    const { service, insert } = createService({
      env: { PFG_GITHUB_TOKEN: "env-github-token" },
    });

    const item = await service.set("githubToken", "db-github-token", "alice");

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "githubToken",
        value: "db-github-token",
        updatedBy: "alice",
      }),
    );
    expect(item).toMatchObject({
      key: "githubToken",
      value: null,
      environmentValue: null,
      source: "database",
      hasDatabaseOverride: true,
      updatedBy: "alice",
      metadata: { secret: true, defaultValue: null },
    });
  });

  it("rejects keys absent from the catalog", async () => {
    const { service } = createService();

    await expect(
      service.set(
        "MISSING_KEY" as RuntimeConfigKey,
        "postgresql://secret",
        "admin",
      ),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("validates and stores database overrides", async () => {
    const { service, insert } = createService();

    await expect(
      service.set("issueMinScore", 59, "admin"),
    ).rejects.toBeInstanceOf(BadRequestException);
    await expect(
      service.set("githubIngestionCron", "not a cron", "admin"),
    ).rejects.toBeInstanceOf(BadRequestException);

    const item = await service.set("issueMinScore", "75", "alice");

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "issueMinScore",
        value: 75,
        updatedBy: "alice",
      }),
    );
    expect(item).toMatchObject({
      key: "issueMinScore",
      value: 75,
      environmentValue: null,
      source: "database",
      updatedBy: "alice",
    });
  });

  it("deletes an override and resolves the environment fallback", async () => {
    const { service, deleteChain } = createService({
      env: { ISSUE_MAX_RETRIES: "8" },
    });

    const item = await service.reset("issueMaxRetries");

    expect(deleteChain.where).toHaveBeenCalled();
    expect(item).toMatchObject({
      key: "issueMaxRetries",
      value: 8,
      environmentValue: "8",
      source: "environment",
      hasDatabaseOverride: false,
    });
  });
});
