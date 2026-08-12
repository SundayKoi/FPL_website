import { describe, expect, it } from "vitest";
import { resolveSiteOrigin } from "./siteOrigin";

describe("resolveSiteOrigin", () => {
  it("prefers the canonical env URL, trimming trailing slashes", () => {
    expect(
      resolveSiteOrigin("https://fpl.example.com/", "fpl-abc.vercel.app", "https", "http://internal"),
    ).toBe("https://fpl.example.com");
  });

  it("ignores a blank env URL", () => {
    expect(resolveSiteOrigin("   ", "fpl.example.com", "https", "http://internal")).toBe(
      "https://fpl.example.com",
    );
  });

  it("falls back to the forwarded host with its proto", () => {
    expect(resolveSiteOrigin(undefined, "fpl.example.com", "https", "http://internal")).toBe(
      "https://fpl.example.com",
    );
  });

  it("defaults the forwarded proto to https", () => {
    expect(resolveSiteOrigin(undefined, "fpl.example.com", null, "http://internal")).toBe(
      "https://fpl.example.com",
    );
  });

  it("uses the request origin when nothing else is available", () => {
    expect(resolveSiteOrigin(undefined, null, null, "http://localhost:3000")).toBe(
      "http://localhost:3000",
    );
  });
});
