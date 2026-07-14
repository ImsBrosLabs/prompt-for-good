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
    updatedAt: "2026-01-01T00:00:00.000Z",
    updatedBy: "local-admin",
  };
}

describe("RuntimeConfigService", () => {
  it("falls back to the catalog default when no override or env value exists", async () => {
    const { service } = createService({ lookupRows: [[]] });

    await expect(service.get("MAX_RETRIES")).resolves.toBe(3);
  });

  it("uses startup env before the catalog default", async () => {
    const { service } = createService({
      env: { MAX_RETRIES: "7" },
      lookupRows: [[]],
    });

    await expect(service.get("MAX_RETRIES")).resolves.toBe(7);
  });

  it("uses the database override before startup env", async () => {
    const { service } = createService({
      env: { MAX_RETRIES: "7" },
      lookupRows: [[override("MAX_RETRIES", 9)]],
    });

    await expect(service.get("MAX_RETRIES")).resolves.toBe(9);
  });

  it("lists env-key catalog entries while keeping secrets hidden", async () => {
    const { service } = createService({
      env: {
        PFG_AGENT_ADMIN_TOKEN: "admin-token",
        GITHUB_TOKEN: "ghp_secret",
        MAX_RETRIES: "7",
        LLM_MODEL: "claude-sonnet-4-6",
      },
      listRows: [override("MAX_RETRIES", 5)],
    });

    const items = await service.list();
    const keys = items.map((item) => item.key);

    expect(keys).toContain("PFG_AGENT_ADMIN_TOKEN");
    expect(keys).toContain("GITHUB_TOKEN");
    expect(keys).toContain("MAX_RETRIES");
    expect(items.find((item) => item.key === "MAX_RETRIES")).toMatchObject({
      value: 5,
      environmentValue: "7",
      source: "database",
      hasDatabaseOverride: true,
    });
    expect(items.find((item) => item.key === "LLM_MODEL")).toMatchObject({
      value: "claude-sonnet-4-6",
      environmentValue: "claude-sonnet-4-6",
      source: "environment",
      hasDatabaseOverride: false,
    });
    expect(
      items.find((item) => item.key === "PFG_AGENT_ADMIN_TOKEN"),
    ).toMatchObject({
      value: null,
      environmentValue: null,
      source: "environment",
      metadata: { secret: true, defaultValue: null, requiredForSetup: true },
    });
  });

  it("persists secret database overrides without echoing secret values", async () => {
    const { service, insert } = createService({
      env: { GITHUB_TOKEN: "env-github-token" },
    });

    const item = await service.set("GITHUB_TOKEN", "db-github-token", "alice");

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "GITHUB_TOKEN",
        value: "db-github-token",
        updatedBy: "alice",
      }),
    );
    expect(item).toMatchObject({
      key: "GITHUB_TOKEN",
      value: null,
      environmentValue: null,
      source: "database",
      hasDatabaseOverride: true,
      updatedBy: "alice",
      metadata: { secret: true, defaultValue: null },
    });
  });

  it("validates and stores JSON overrides", async () => {
    const { service, insert } = createService();

    await expect(
      service.set("VERIFICATION_COMMANDS", "npm test", "admin"),
    ).rejects.toBeInstanceOf(BadRequestException);

    const item = await service.set(
      "VERIFICATION_COMMANDS",
      ["npm test", "npm run lint"],
      "alice",
    );

    expect(insert.values).toHaveBeenCalledWith(
      expect.objectContaining({
        key: "VERIFICATION_COMMANDS",
        value: ["npm test", "npm run lint"],
      }),
    );
    expect(item).toMatchObject({
      key: "VERIFICATION_COMMANDS",
      value: ["npm test", "npm run lint"],
      source: "database",
    });
  });

  it("parses JSON startup env values", async () => {
    const { service } = createService({
      env: { VERIFICATION_COMMANDS: "[\"npm test\"]" },
      lookupRows: [[]],
    });

    await expect(service.get("VERIFICATION_COMMANDS")).resolves.toEqual([
      "npm test",
    ]);
  });

  it("rejects keys absent from the catalog", async () => {
    const { service } = createService();

    await expect(
      service.set("MISSING_KEY" as RuntimeConfigKey, "value", "admin"),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it("deletes an override and resolves the startup env fallback", async () => {
    const { service, deleteChain } = createService({
      env: { MAX_RETRIES: "8" },
    });

    const item = await service.reset("MAX_RETRIES");

    expect(deleteChain.where).toHaveBeenCalled();
    expect(item).toMatchObject({
      key: "MAX_RETRIES",
      value: 8,
      environmentValue: "8",
      source: "environment",
      hasDatabaseOverride: false,
    });
  });
});
