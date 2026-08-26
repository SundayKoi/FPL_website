import { describe, expect, it } from "vitest";
import { championSplashUrl } from "@/lib/match-draft/champions";
import { hiResLogoUrl } from "@/components/cards/ChampionsCard";
import { CHAMPIONS_SET, CHAMPION_TIER, championToCard } from "./champions";

describe("the Dealer's Hand set", () => {
  it("is exactly five cards with unique ranks, slugs and positions", () => {
    expect(CHAMPIONS_SET).toHaveLength(5);
    expect(new Set(CHAMPIONS_SET.map((def) => def.rank)).size).toBe(5);
    expect(new Set(CHAMPIONS_SET.map((def) => def.setIndex))).toEqual(new Set([1, 2, 3, 4, 5]));
    const slugs = CHAMPIONS_SET.map((def) => championToCard(def, "S5").slug);
    expect(new Set(slugs).size).toBe(5);
  });

  it("deals the ranks the roster's names demand", () => {
    const byRank = new Map(CHAMPIONS_SET.map((def) => [def.rank, def]));
    expect(byRank.get("K")?.name).toBe("king of spades");
    expect(byRank.get("A")?.name).toBe("i am atomic");
    // Shanedata took the Queen (dealer's call), stats under Feral Eevee.
    expect(byRank.get("Q")?.name).toBe("Shanedata");
    expect(byRank.get("Q")?.riot).toEqual({ summoner: "Feral Eevee", tag: "133" });
    expect(byRank.get("7")?.name).toBe("7gen");
    expect(byRank.get("JOKER")?.name).toBe("the fool");
    expect(byRank.get("JOKER")?.joker).toBe(true);
  });

  it("resolves every champion to real splash art", () => {
    // The punctuated names are the trap: "Cho'Gath", "Aurelion Sol" and
    // "Xin Zhao" must all reach a Data Dragon id or the card renders a
    // hole where the champion goes.
    for (const def of CHAMPIONS_SET) {
      const url = championSplashUrl(def.champion, 0);
      expect(url, `${def.champion} has no splash`).toBeTruthy();
      expect(url).toMatch(/\/champion\/splash\/[A-Za-z]+_0\.jpg$/);
    }
  });

  it("wraps into a card behind the champWin branch, never as a rating", () => {
    const card = championToCard(CHAMPIONS_SET[0], "S5");
    expect(card.champWin?.rank).toBe("K");
    expect(card.champWin?.setSize).toBe(5);
    expect(card.champWin?.seasonWon).toBe("S4");
    expect(card.slug).toBe("faceless-k");
    expect(card.overall).toBe(0);
    expect(card.tier.label).toBe("Champion");
    expect(CHAMPION_TIER).toBe("champion");
    // The copy shelves in the CURRENT season; the card names the one won.
    expect(card.season).toBe("S5");
  });
});

describe("hiResLogoUrl", () => {
  it("asks Discord's CDN for a 1024px render", () => {
    expect(hiResLogoUrl("https://cdn.discordapp.com/icons/1/abc.png")).toBe(
      "https://cdn.discordapp.com/icons/1/abc.png?size=1024",
    );
    // An existing size param is replaced, not stacked.
    expect(hiResLogoUrl("https://media.discordapp.net/x/y.png?size=96")).toBe(
      "https://media.discordapp.net/x/y.png?size=1024",
    );
  });

  it("leaves every other host untouched — an unverified transform 404s into a blank center", () => {
    const storage = "https://abc.supabase.co/storage/v1/object/public/teams/faceless.png";
    expect(hiResLogoUrl(storage)).toBe(storage);
    expect(hiResLogoUrl("not a url")).toBe("not a url");
  });
});
