import { describe, expect, it } from "vitest";
import { gauntletOverhaulAnnouncement } from "./announcement";

describe("the overhaul announcement", () => {
  it("names every piece, links the rulebook, and fits a Discord embed", () => {
    const embed = gauntletOverhaulAnnouncement("https://fpl.example/");
    expect(embed.description).toContain("bank or push");
    expect(embed.description).toContain("A1 THE LONG WALL");
    expect(embed.description).toContain("Contracts");
    expect(embed.description).toContain("Openers");
    expect(embed.description).toContain("THE ORACLE");
    expect(embed.description).toContain("Drafted mode");
    expect(embed.description).toContain("https://fpl.example/cards/gauntlet");
    expect(embed.description.length).toBeLessThan(4096);
  });
});
