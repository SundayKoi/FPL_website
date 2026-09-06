import { describe, expect, it } from "vitest";
import { ECLIPSE_CHANCE, FOIL_CHANCE, FOIL_TYPE_WEIGHTS, SECRET_CHANCE, SHINY_CHANCE, STATTRAK_CHANCE } from "@/lib/packs/config";
import { oneIn, perPackPct, rarityGuide } from "./rarityGuide";

describe("oneIn / perPackPct", () => {
  it("rounds a gate to a whole 'one in'", () => {
    expect(oneIn(1 / 64)).toBe("1 in 64");
    expect(oneIn(0.002)).toBe("1 in 500");
    expect(oneIn(0)).toBe("never");
  });
  it("turns a per-card gate into a per-pack chance over five cards", () => {
    expect(perPackPct(0.02)).toBe("9.6% of packs");
    expect(perPackPct(0.06)).toBe("27% of packs");
  });
});

describe("rarityGuide", () => {
  const guide = rarityGuide("S5", "premier");
  const entry = (key: string) => guide.flatMap((section) => section.entries).find((item) => item.key === key)!;

  it("prints the finishes at the gates the shop rolls", () => {
    expect(entry("shiny").odds).toBe(`${oneIn(SHINY_CHANCE)} cards`);
    expect(entry("stattrak").odds).toBe(`${oneIn(STATTRAK_CHANCE)} cards`);
    expect(entry("secret").odds).toBe(`${oneIn(SECRET_CHANCE)} cards`);
    expect(entry("eclipse").odds).toContain(oneIn(ECLIPSE_CHANCE));
    for (const key of ["shiny", "stattrak", "secret"]) expect(entry(key).fresh).toBe(true);
  });

  it("names this season's parallels by the skin line, with per-card odds off the ladder", () => {
    const total = Object.values(FOIL_TYPE_WEIGHTS).reduce((sum, weight) => sum + weight, 0);
    expect(entry("prisma").name).toBe("Battlecast");
    expect(entry("ice").name).toBe("Battlecast Ultimate");
    expect(entry("ice").odds).toBe(`${oneIn(FOIL_CHANCE * (FOIL_TYPE_WEIGHTS.ice / total))} cards`);
  });

  it("falls back to the ladder's own names for a season without a line", () => {
    const plain = rarityGuide("S1", "premier").flatMap((section) => section.entries);
    expect(plain.find((item) => item.key === "ice")?.name).toBe("Cracked Ice");
  });

  it("keeps the champions relic off the academy guide", () => {
    const academy = rarityGuide("S5", "academy").flatMap((section) => section.entries);
    expect(academy.some((item) => item.key === "relic")).toBe(false);
    expect(entry("relic")).toBeTruthy();
  });

  it("gives every entry the four lines the page prints", () => {
    for (const section of guide) {
      expect(section.entries.length).toBeGreaterThan(0);
      for (const item of section.entries) {
        for (const field of [item.name, item.look, item.how, item.odds, item.value]) expect(field.length).toBeGreaterThan(0);
      }
    }
  });
});
