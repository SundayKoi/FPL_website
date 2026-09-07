import { describe, expect, it } from "vitest";
import { GOD_PACK_ODDS_DENOMINATOR } from "./config";
import { isGodPackDraw } from "./godGate";

describe("God Pack gate", () => {
  it("accepts exactly one integer draw in the configured range", () => {
    expect(isGodPackDraw(0)).toBe(true);
    expect(isGodPackDraw(1)).toBe(false);
    expect(isGodPackDraw(GOD_PACK_ODDS_DENOMINATOR - 1)).toBe(false);
    expect(isGodPackDraw(GOD_PACK_ODDS_DENOMINATOR)).toBe(false);
    expect(isGodPackDraw(-1)).toBe(false);
    expect(isGodPackDraw(0.5)).toBe(false);
  });
});
