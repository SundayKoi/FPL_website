import { describe, expect, it } from "vitest";
import { resolveMetadataBase } from "./metadataBase";

describe("resolveMetadataBase", () => {
  it("uses the canonical site URL", () => {
    expect(resolveMetadataBase("https://fpl.example")?.toString()).toBe("https://fpl.example/");
  });

  it("tolerates a trailing slash and surrounding space", () => {
    expect(resolveMetadataBase("  https://fpl.example/  ")?.toString()).toBe("https://fpl.example/");
  });

  it("falls back to undefined rather than throwing on a bad value", () => {
    // A malformed env var must not take every page's metadata down.
    expect(resolveMetadataBase("not a url")).toBeUndefined();
    expect(resolveMetadataBase("")).toBeUndefined();
    expect(resolveMetadataBase(undefined)).toBeUndefined();
  });
});
