import { describe, expect, it } from "vitest";
import { CHAMPIONS, championByName, championCenteredUrl, championDisplayName, championIconUrl, championSplashUrl } from "./champions";

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
