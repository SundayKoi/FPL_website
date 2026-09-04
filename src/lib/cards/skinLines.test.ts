import { describe, expect, it } from "vitest";
import { FOIL_TYPE_LABELS } from "@/lib/packs/config";
import { LINE_TIERS, SEASON_LINES, lineTierOf, lineTreatmentFor, parallelLabelFor, seasonLineOf } from "./skinLines";

describe("the season's skin line", () => {
  it("draws Season 5 in Battlecast and every other season as the ladder", () => {
    expect(SEASON_LINES.S5).toBe("battlecast");
    expect(seasonLineOf("S5")?.label).toBe("Battlecast");
    expect(seasonLineOf("S4")).toBeNull();
    expect(seasonLineOf(null)).toBeNull();
  });

  it("puts each rung on its tier, and Eclipse on none", () => {
    expect(LINE_TIERS.map((tier) => tier.replaces)).toEqual(["prisma", "aurora", "refractor", "ice"]);
    expect(lineTierOf("aurora")?.key).toBe("chroma");
    expect(lineTierOf("eclipse")).toBeNull();
    expect(lineTierOf("chartreuse")).toBeNull();
  });

  it("names a parallel as the line's tier only under a season with a line", () => {
    expect(parallelLabelFor("S5", "prisma", FOIL_TYPE_LABELS.prisma)).toBe("Battlecast");
    expect(parallelLabelFor("S5", "refractor", FOIL_TYPE_LABELS.refractor)).toBe("Battlecast Prestige");
    expect(parallelLabelFor("S5", "eclipse", FOIL_TYPE_LABELS.eclipse)).toBe("Eclipse");
    expect(parallelLabelFor("S4", "refractor", FOIL_TYPE_LABELS.refractor)).toBe("Refractor");
  });

  it("hands the card the same shape a mockup preview would", () => {
    expect(lineTreatmentFor("S5", "ice")).toEqual({
      label: "Battlecast Ultimate",
      className: "card-foil-line-battlecast",
      modifier: "card-foil-tier-ultimate",
      blend: "color-dodge",
      accent: "#ff2a2a",
      layers: ["card-foil-tier-ultimate-embers"],
      tier: "ultimate",
    });
    expect(lineTreatmentFor("S5", "eclipse")).toBeNull();
    expect(lineTreatmentFor("S4", "ice")).toBeNull();
  });
});
