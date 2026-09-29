import { describe, it, expect } from "vitest";
import { safeNextPath } from "@/lib/auth/safeNextPath";

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

  // Regression: WHATWG URL parsing treats a leading backslash the same as a
  // forward slash — `new URL("/\evil.com", origin)` resolves to
  // `https://evil.com/`, hopping origin past a startsWith("/")/
  // startsWith("//") check alone. A crafted `?next=%2F%5Cevil.com` decodes
  // to exactly this string.
  it("rejects a path containing a backslash (WHATWG separator bypass)", () => {
    expect(safeNextPath("/\\evil.com")).toBe("/");
    expect(safeNextPath("/\\/evil.com")).toBe("/");
    expect(safeNextPath("/betting\\.evil.com")).toBe("/");
  });

  it("rejects the exact query-decoded attack string (%2F%5C -> /\\)", () => {
    const decoded = decodeURIComponent("%2F%5Cevil.com");
    expect(decoded).toBe("/\\evil.com");
    expect(safeNextPath(decoded)).toBe("/");
  });

  it("rejects any other origin-hopping value the string checks miss (belt-and-suspenders origin check)", () => {
    // Mixed/backslash-free forms that could still resolve off-origin under
    // some URL parser would be caught by the final origin comparison, not
    // just the string checks above.
    expect(safeNextPath("/\t/evil.com")).toBe("/");
  });
});
