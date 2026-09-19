import { describe, expect, it } from "vitest";
import { mulberry32 } from "./prng";

describe("mulberry32", () => {
  it("is deterministic per seed and different across seeds", () => {
    const a1 = mulberry32(42);
    const a2 = mulberry32(42);
    const b = mulberry32(43);
    const runA1 = [a1(), a1(), a1()];
    const runA2 = [a2(), a2(), a2()];
    const runB = [b(), b(), b()];
    expect(runA1).toEqual(runA2);
    expect(runA1).not.toEqual(runB);
    for (const value of runA1) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of runA1) expect(value).toBeLessThan(1);
  });
});
