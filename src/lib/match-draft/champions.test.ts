import { describe, expect, it } from "vitest";
import championMap from "@/lib/season-end/champion-map.json";
import { CHAMPIONS, DDRAGON_VERSION, championByName, championCenteredUrl, championDisplayName, championIconUrl, championSplashUrl } from "./champions";

describe("match draft champion metadata", () => {
  it("builds Data Dragon image URLs for champions", () => {
    expect(championIconUrl("Ahri")).toBe("https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/Ahri.png");
    expect(championSplashUrl("Ahri")).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Ahri_0.jpg");
  });

  it("uses Data Dragon ids for champion names that do not match file names", () => {
    expect(championByName("Wukong")?.id).toBe("MonkeyKing");
    expect(championIconUrl("Wukong")).toBe("https://ddragon.leagueoflegends.com/cdn/16.16.1/img/champion/MonkeyKing.png");
    expect(championByName("Nunu & Willump")?.id).toBe("Nunu");
  });

  it("resolves Riot's internal championName spellings (what raw_stats stores)", () => {
    // Riot match-v5 reports the DDragon id, not the display name.
    expect(championByName("MonkeyKing")?.name).toBe("Wukong");
    expect(championByName("MissFortune")?.name).toBe("Miss Fortune");
    expect(championByName("Kaisa")?.name).toBe("Kai'Sa");
    expect(championByName("TahmKench")?.name).toBe("Tahm Kench");
    expect(championByName("JarvanIV")?.name).toBe("Jarvan IV");
    expect(championByName("Chogath")?.name).toBe("Cho'Gath");
    expect(championByName("FiddleSticks")?.name).toBe("Fiddlesticks");
    expect(championByName("Renata")?.name).toBe("Renata Glasc");
    expect(championCenteredUrl("Kaisa")).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Kaisa_0.jpg");
  });

  it("points Renata Glasc at Riot's id, Renata, not a stripped display name", () => {
    // Her id is the first name only. Stripping punctuation from the display
    // name gives "RenataGlasc", which is neither what raw_stats says nor what
    // Data Dragon names her files, so her games went unrecognised and art
    // built from her display name pointed at the wrong file.
    expect(championByName("Renata Glasc")?.id).toBe("Renata");
    expect(championDisplayName("Renata")).toBe("Renata Glasc");
    expect(championIconUrl("Renata Glasc")).toBe(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/Renata.png`);
    expect(championIconUrl("Renata")).toBe(`https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/Renata.png`);
    expect(championSplashUrl("Renata Glasc")).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/splash/Renata_0.jpg");
    expect(championCenteredUrl("Renata Glasc", 1)).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Renata_1.jpg");
  });

  it("gives every champion the id in the pinned Data Dragon snapshot", () => {
    // src/lib/season-end/champion-map.json is a pinned snapshot of Data
    // Dragon's champion.json (docs/season-end-cards.md), keyed by id. A
    // display name whose id is not the name with punctuation stripped needs
    // a DATA_DRAGON_IDS entry; this catches one that was missed, for every
    // champion both lists know.
    const riotId = new Map(Object.entries(championMap as Record<string, { name: string }>).map(([id, entry]) => [entry.name, id]));
    const wrong = CHAMPIONS.filter((champion) => riotId.has(champion.name) && riotId.get(champion.name) !== champion.id).map(
      (champion) => `${champion.name}: ${champion.id}, Data Dragon says ${riotId.get(champion.name)}`,
    );
    expect(wrong).toEqual([]);
  });

  it("pretty-prints any alias and passes unknown names through", () => {
    expect(championDisplayName("MonkeyKing")).toBe("Wukong");
    expect(championDisplayName("Ahri")).toBe("Ahri");
    expect(championDisplayName("NotAChampion")).toBe("NotAChampion");
  });
});

describe("champion roles", () => {
  it("gives every champion a curated role list (no all-roles fallback)", () => {
    for (const champion of CHAMPIONS) {
      expect(champion.roles.length, `${champion.name} is missing from CHAMPION_ROLES`).toBeGreaterThanOrEqual(1);
      expect(champion.roles.length, `${champion.name} fell back to all five roles`).toBeLessThanOrEqual(3);
    }
  });
});

describe("art for champions outside the bundled roster", () => {
  // The bundled list is a snapshot. Riot ships champions between our
  // deploys, and the art helpers used to answer null for anyone missing
  // from it — and null means no image at all, so cards, moment plates,
  // scouting rows and match summaries rendered a blank.
  const NEWER = "Zaheen";

  it("builds an icon url for a champion the roster has never heard of", () => {
    expect(championByName(NEWER)).toBeNull();
    expect(championIconUrl(NEWER)).toBe(
      `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/${NEWER}.png`,
    );
  });

  it("builds splash art for one too", () => {
    expect(championSplashUrl(NEWER)).toBe(
      `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${NEWER}_0.jpg`,
    );
  });

  it("honours the skin number on a champion it does not know", () => {
    expect(championSplashUrl(NEWER, 3)).toBe(
      `https://ddragon.leagueoflegends.com/cdn/img/champion/splash/${NEWER}_3.jpg`,
    );
  });

  it("reaches centered art through the same fallback", () => {
    expect(championCenteredUrl(NEWER)).toBe(
      `https://ddragon.leagueoflegends.com/cdn/img/champion/centered/${NEWER}_0.jpg`,
    );
  });

  it("strips punctuation the way Riot's ids do", () => {
    expect(championIconUrl("Some'Name")).toContain("/SomeName.png");
  });

  it("still returns null for a name with nothing usable in it", () => {
    // Otherwise this builds a url ending in a bare slash and requests it.
    expect(championIconUrl("   ")).toBeNull();
    expect(championSplashUrl("!!!")).toBeNull();
  });

  it("leaves a known champion's art exactly as it was", () => {
    // The fallback must not change the answer for anyone already listed —
    // Wukong's id is MonkeyKing, which stripping punctuation would miss.
    expect(championIconUrl("Wukong")).toBe(
      `https://ddragon.leagueoflegends.com/cdn/${DDRAGON_VERSION}/img/champion/MonkeyKing.png`,
    );
    expect(championSplashUrl("Wukong", 2)).toBe(
      "https://ddragon.leagueoflegends.com/cdn/img/champion/splash/MonkeyKing_2.jpg",
    );
  });
});

describe("the bundled roster and the role map", () => {
  it("gives every bundled champion a role, so none defaults to all five", () => {
    // A champion with no role entry falls back to every role and shows up
    // under all five filters at once, which reads as "plays everywhere"
    // rather than "we don't know".
    const unroled = CHAMPIONS.filter((champion) => champion.roles.length === 5).map((c) => c.name);
    expect(unroled).toEqual([]);
  });
});
