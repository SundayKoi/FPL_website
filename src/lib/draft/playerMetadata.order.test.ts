import { describe, expect, it } from "vitest";
import { comparePlayerRanks } from "./playerMetadata";

describe("comparePlayerRanks", () => {
  it("sorts master ranks before diamond ranks", () => {
    expect(comparePlayerRanks("M10", "D1")).toBeLessThan(0);
  });

  it("sorts diamond ranks before emerald ranks", () => {
    expect(comparePlayerRanks("D2", "E1")).toBeLessThan(0);
  });

  it("sorts lower division numbers first within the same tier", () => {
    expect(comparePlayerRanks("D1", "D2")).toBeLessThan(0);
  });

  it("puts null or malformed ranks after known ranks", () => {
    expect(comparePlayerRanks("M1", null)).toBeLessThan(0);
    expect(comparePlayerRanks(null, "M1")).toBeGreaterThan(0);
    expect(comparePlayerRanks("M1", "broken")).toBeLessThan(0);
  });

  it("returns zero for equal ranks", () => {
    expect(comparePlayerRanks("D3", "D3")).toBe(0);
  });
});
