import { describe, expect, it } from "vitest";
import { resolveOpenApiServerUrl } from "../src/openapi/swagger";

describe("resolveOpenApiServerUrl", () => {
  it("uses the current origin by default", () => {
    expect(resolveOpenApiServerUrl()).toBe("/");
  });

  it("uses PUBLIC_BASE_URL when configured", () => {
    expect(
      resolveOpenApiServerUrl({ publicBaseUrl: "https://hub.example.test" }),
    ).toBe("https://hub.example.test");
  });

  it("removes trailing slashes from PUBLIC_BASE_URL", () => {
    expect(
      resolveOpenApiServerUrl({ publicBaseUrl: "https://hub.example.test///" }),
    ).toBe("https://hub.example.test");
  });

  it("falls back to the current origin when PUBLIC_BASE_URL is blank", () => {
    expect(resolveOpenApiServerUrl({ publicBaseUrl: "   " })).toBe("/");
  });
});
