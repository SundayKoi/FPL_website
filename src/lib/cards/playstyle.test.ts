import { describe, expect, it } from "vitest";
import { CHAMPIONS } from "@/lib/match-draft/champions";
import { CHAMPION_CLASSES, PLAYSTYLE_LABELS, championClass, playstyleOf, windowPlaystyleLabel } from "./playstyle";

describe("champion classes", () => {
  it("classifies every champion in the bundled roster", () => {
    // A new champion added by scripts/sync-champions.ts lands here until
    // someone says what it does — the same contract CHAMPION_ROLES has.
    for (const champion of CHAMPIONS) {
      expect(CHAMPION_CLASSES.get(champion.name), `${champion.name} has no class in src/lib/cards/playstyle.ts`).toBeDefined();
    }
  });

  it("lists no champion under two classes", () => {
    // The map is built from per-class lists, so a duplicate would silently
    // take whichever class came last.
    expect(CHAMPION_CLASSES.size).toBe(CHAMPIONS.length);
  });

  it("reads Riot's internal spellings, which is what raw_stats stores", () => {
    expect(championClass("MonkeyKing")).toBe("bruiser");
    expect(championClass("Chogath")).toBe("tank");
    expect(championClass("KSante")).toBe("tank");
    expect(championClass("FiddleSticks")).toBe("mage");
    expect(championClass("NotAChampion")).toBeNull();
    expect(championClass(null)).toBeNull();
  });
});

describe("playstyleOf", () => {
  it("grades the same champion by the job it does in that role", () => {
    expect(playstyleOf("MIDDLE", "Karma")).toBe("mage");
    expect(playstyleOf("UTILITY", "Karma")).toBe("enchanter");
    expect(playstyleOf("UTILITY", "Seraphine")).toBe("enchanter");
    expect(playstyleOf("UTILITY", "Leona")).toBe("engage");
    expect(playstyleOf("TOP", "Sion")).toBe("tank");
    expect(playstyleOf("UTILITY", "Brand")).toBe("mage");
  });

  it("buckets each role into the styles it sees", () => {
    expect(playstyleOf("MIDDLE", "Zed")).toBe("assassin");
    expect(playstyleOf("MIDDLE", "Yone")).toBe("fighter");
    expect(playstyleOf("JUNGLE", "Viego")).toBe("carry");
    expect(playstyleOf("JUNGLE", "Graves")).toBe("carry");
    expect(playstyleOf("JUNGLE", "Lillia")).toBe("mage");
    expect(playstyleOf("TOP", "Fiora")).toBe("skirmisher");
    expect(playstyleOf("TOP", "Vayne")).toBe("ranged");
    expect(playstyleOf("BOTTOM", "Nilah")).toBe("marksman");
    expect(playstyleOf("BOTTOM", "Ziggs")).toBe("mage");
    expect(playstyleOf("BOTTOM", "Chogath")).toBe("other");
  });

  it("returns null for a champion it cannot place", () => {
    expect(playstyleOf("TOP", "NotAChampion")).toBeNull();
    expect(playstyleOf("TOP", "")).toBeNull();
  });
});

describe("style bar label", () => {
  it("names the style that holds a majority of the window's games", () => {
    expect(windowPlaystyleLabel(["assassin", "assassin", "mage"])).toBe("Assassin");
    expect(windowPlaystyleLabel(["tank"])).toBe("Tank");
  });

  it("falls back to a neutral label when no style has a majority", () => {
    expect(windowPlaystyleLabel(["assassin", "mage"])).toBe("Playstyle");
    expect(windowPlaystyleLabel([])).toBe("Playstyle");
  });

  it("keeps every label inside the width the card reserves", () => {
    for (const label of Object.values(PLAYSTYLE_LABELS)) expect(label.length).toBeLessThanOrEqual("Objectives".length);
  });
});
