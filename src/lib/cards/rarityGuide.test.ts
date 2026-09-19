import { describe, expect, it } from "vitest";
import { ECLIPSE_CHANCE, FOIL_CHANCE, FOIL_TYPE_WEIGHTS, ON_AIR_CHANCE, ON_AIR_COPIES, SECRET_CHANCE, SHINY_CHANCE, STATTRAK_CHANCE } from "@/lib/packs/config";
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

  it("lists the On Air card as an insert, at the gate the shop actually rolls", () => {
    // The whole point of this one being on the page: the Dribb is a secret
    // and this is not, because people have to know to be in the room.
    expect(entry("onair").odds).toBe(`${oneIn(ON_AIR_CHANCE)} packs, live only`);
    expect(entry("onair").how).toContain("Live Drops window");
    expect(entry("onair").how).toContain(oneIn(ON_AIR_CHANCE));
    expect(entry("onair").value).toContain(String(ON_AIR_COPIES));
    expect(entry("onair").value).toContain("Never dusts");
    // On the academy guide too: the casters call both leagues.
    expect(rarityGuide("S5", "academy").flatMap((section) => section.entries).some((item) => item.key === "onair")).toBe(true);
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

  it("spells out the wear grades from the thresholds that grade them", () => {
    expect(entry("wear").look).toContain("Factory New (0), Minimal Wear (1–2), Field-Tested (3–5), Well-Worn (6–10), Battle-Scarred (11+)");
    expect(entry("slab").how).toContain("never be fielded again");
    expect(guide.map((section) => section.key)).not.toContain("next");
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
