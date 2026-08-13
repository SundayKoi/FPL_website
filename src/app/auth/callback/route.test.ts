import { describe, it, expect } from "vitest";
import { safeNextPath } from "./route";

describe("safeNextPath", () => {
  it("defaults to / when no next param is given", () => {
    expect(safeNextPath(null)).toBe("/");
  });

  it("allows a same-site relative path", () => {
    expect(safeNextPath("/betting")).toBe("/betting");
    expect(safeNextPath("/betting/market/7")).toBe("/betting/market/7");
  });

  it("rejects an absolute URL", () => {
    expect(safeNextPath("https://evil.com")).toBe("/");
  });

  it("rejects a protocol-relative URL", () => {
    expect(safeNextPath("//evil.com")).toBe("/");
  });

  it("rejects a path with no leading slash", () => {
    expect(safeNextPath("betting")).toBe("/");
  });
});
