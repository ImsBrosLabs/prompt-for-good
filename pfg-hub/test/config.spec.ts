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

  it("keeps HTTPS disabled by default with mkcert local paths configured", () => {
    delete process.env.HTTPS_ENABLED;
    delete process.env.HTTPS_CERT_PATH;
    delete process.env.HTTPS_KEY_PATH;

    expect(loadConfig()).toMatchObject({
      httpsEnabled: false,
      httpsCertPath: "./certs/hub.pfg.local.pem",
      httpsKeyPath: "./certs/hub.pfg.local-key.pem",
    });
  });

  it("reads HTTPS settings from the environment", () => {
    process.env.HTTPS_ENABLED = "true";
    process.env.HTTPS_CERT_PATH = "./custom/cert.pem";
    process.env.HTTPS_KEY_PATH = "./custom/key.pem";

    expect(loadConfig()).toMatchObject({
      httpsEnabled: true,
      httpsCertPath: "./custom/cert.pem",
      httpsKeyPath: "./custom/key.pem",
    });
  });

  it("parses a comma-separated CORS origin allowlist", () => {
    process.env.CORS_ORIGINS =
      " https://admin.example.com, http://localhost:5173 ";

    expect(loadConfig().corsOrigins).toEqual([
      "https://admin.example.com",
      "http://localhost:5173",
    ]);
  });
});
