import { describe, expect, it } from "vitest";
import { fmtPoints } from "./format";

describe("fmtPoints", () => {
  it("formats positive points with thousands separators", () => {
    expect(fmtPoints(1234)).toBe("$1,234");
  });

  it("formats zero", () => {
    expect(fmtPoints(0)).toBe("$0");
  });

  it("puts the minus sign before the dollar sign for negatives", () => {
    expect(fmtPoints(-500)).toBe("-$500");
  });

  it("formats large numbers with multiple separators", () => {
    expect(fmtPoints(1234567)).toBe("$1,234,567");
  });
});
