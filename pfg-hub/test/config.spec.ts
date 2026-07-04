import { afterEach, describe, expect, it } from "vitest";
import { loadConfig } from "../src/config";

const originalEnv = { ...process.env };

describe("loadConfig", () => {
  afterEach(() => {
    process.env = { ...originalEnv };
  });

  it("uses the default local postgres connection URL", () => {
    delete process.env.DATABASE_URL;

    expect(loadConfig().databaseUrl).toBe(
      "postgresql://pfg:pfg@localhost:5432/pfg",
    );
  });

  it("prefers DATABASE_URL when present", () => {
    process.env.DATABASE_URL = "postgresql://direct";

    expect(loadConfig().databaseUrl).toBe("postgresql://direct");
  });
});
