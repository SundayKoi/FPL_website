import { describe, expect, it } from "vitest";
import type { AwardDefinition } from "./catalog";
import { formatAwardPresentation, formatInteger, roundHalfAwayFromZero } from "./presentation";

const award = (overrides: Partial<AwardDefinition> = {}): AwardDefinition => ({
  id: "penthouse",
  title: "Penthouse",
  description: "Most pentakills per game.",
  group: "Record breakers",
  scope: "player",
  partition: "division",
  mode: "perGame",
  unit: "pentakills/game",
  ...overrides,
});

const winner = (value: number, total?: number) => ({
  name: "Alice#NA1",
  team: "Wolves",
  value,
  total,
  games: 10,
});

describe("season-end presentation", () => {
  it("rounds half away from zero, normalizes negative zero, and adds separators", () => {
    expect(roundHalfAwayFromZero(1.49)).toBe(1);
    expect(roundHalfAwayFromZero(1.5)).toBe(2);
    expect(roundHalfAwayFromZero(-1.49)).toBe(-1);
    expect(roundHalfAwayFromZero(-1.5)).toBe(-2);
    expect(formatInteger(-0.4)).toBe("0");
    expect(formatInteger(1234.5)).toBe("1,235");
  });

  it.each([0, 0.2, 0.99])("uses an observed additive total below one (%s)", (value) => {
    const display = formatAwardPresentation(award({ totalUnit: "pentakills", totalFallback: true }), winner(value, 2));
    expect(display.headline).toBe("2 total");
    expect(display.unit).toBe("pentakills");
    expect(display.evidence).not.toContain("2 total");
  });

  it("keeps exactly one as a per-game rate with singular grammar", () => {
    const display = formatAwardPresentation(award({ totalUnit: "pentakills", totalFallback: true }), winner(1, 10));
    expect(display.headline).toBe("1");
    expect(display.unit).toBe("pentakill/game");
  });

  it("does not fabricate a total when numerator metadata is missing", () => {
    const display = formatAwardPresentation(award({ totalUnit: "pentakills", totalFallback: true }), winner(0.2));
    expect(display.headline).toBe("0");
    expect(display.unit).toBe("pentakills/game");
    expect(display.evidence).not.toContain("total");
  });

  it("uses the matching season numerator for a per-minute metric", () => {
    const display = formatAwardPresentation(award({ mode: "minute", unit: "casts/min", totalUnit: "casts", totalFallback: true }), winner(0.99, 99));
    expect(display.headline).toBe("99 total");
    expect(display.unit).toBe("casts");
  });

  it("does not turn percentages, ratios, or durations into totals", () => {
    expect(formatAwardPresentation(award({ mode: "rate", unit: "%" }), winner(0.8, 1)).headline).toBe("1");
    expect(formatAwardPresentation(award({ mode: "mean", unit: "×" }), winner(0.8, 8)).headline).toBe("1");
    expect(formatAwardPresentation(award({ id: "speedrunners", mode: undefined, unit: undefined }), winner(0.8, 8)).headline).toBe("1");
  });

  it("keeps Best of score and KDA evidence free of decimals", () => {
    const display = formatAwardPresentation(award({
      id: "best-of-champion",
      title: "Best of Azir",
      group: "Best of Champions",
      partition: "league",
      mode: undefined,
      unit: undefined,
    }), {
      ...winner(84.6),
      evidence: { record: "2–0", kda: 8.5 },
    });
    expect(display.headline).toBe("85");
    expect(display.evidence).toContain("85/100 score");
    expect(display.evidence).toContain("9 KDA");
    expect(display.evidence).not.toMatch(/\d+\.\d/);
  });
});
