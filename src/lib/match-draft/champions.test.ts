import { describe, expect, it } from "vitest";
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
    expect(championCenteredUrl("Kaisa")).toBe("https://ddragon.leagueoflegends.com/cdn/img/champion/centered/Kaisa_0.jpg");
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
