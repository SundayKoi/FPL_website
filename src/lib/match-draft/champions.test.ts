import { describe, expect, it } from "vitest";
import { CHAMPIONS, championByName, championIconUrl, championSplashUrl } from "./champions";

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
});

describe("champion roles", () => {
  it("gives every champion a curated role list (no all-roles fallback)", () => {
    for (const champion of CHAMPIONS) {
      expect(champion.roles.length, `${champion.name} is missing from CHAMPION_ROLES`).toBeGreaterThanOrEqual(1);
      expect(champion.roles.length, `${champion.name} fell back to all five roles`).toBeLessThanOrEqual(3);
    }
  });
});
