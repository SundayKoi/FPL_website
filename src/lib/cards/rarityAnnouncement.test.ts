import { describe, expect, it } from "vitest";
import { rarityAnnouncement } from "./rarityAnnouncement";

describe("the rarities announcement", () => {
  it("names all three finishes with their real gates, links the guide, and fits an embed", () => {
    const embed = rarityAnnouncement("https://fpl.example/");
    expect(embed.description).toContain("Shiny — 1 in 128 cards");
    expect(embed.description).toContain("StatTrak™ — 1 in 100 cards");
    expect(embed.description).toContain("Secret — 1 in 1,000 cards");
    expect(embed.description).toContain("Wear and slabbing");
    expect(embed.description).toContain("https://fpl.example/cards/rarities");
    expect(embed.description).toContain("https://fpl.example/cards/packs");
    expect(embed.description.length).toBeLessThan(4096);
  });
});
