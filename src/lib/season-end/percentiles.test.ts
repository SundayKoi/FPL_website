import { describe, expect, it } from "vitest";
import { createMidrankIndex } from "./percentiles";

describe("season-end percentile ranks", () => {
  it("keeps tied observations equal, endpoints exact, and the input unchanged", () => {
    const values = [4, 2, 1, 2];
    expect([...createMidrankIndex(values)!]).toEqual([[1, 0], [2, 50], [4, 100]]);
    expect(values).toEqual([4, 2, 1, 2]);
    expect(createMidrankIndex([12])?.get(12)).toBe(50);
    expect(createMidrankIndex([12, 12, 12])?.get(12)).toBe(50);
  });

  it("withholds scores for empty or incomplete reference coverage", () => {
    for (const values of [[], [1, NaN], [1, Infinity], [-Infinity, 1]]) {
      expect(createMidrankIndex(values)).toBeNull();
    }
  });
});
