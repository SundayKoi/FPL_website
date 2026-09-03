import { describe, expect, it } from "vitest";
import { siteDestinations, siteDirectory } from "./directory";

describe("siteDirectory", () => {
  it("groups the site the way people ask for it", () => {
    expect(siteDirectory("premier").map((group) => group.label)).toEqual(["League", "Cards", "Premium", "Daily games", "Info"]);
  });

  it("gives every destination a line saying what it is, and no two the same href", () => {
    const items = siteDestinations("premier");
    const hrefs = new Set<string>();
    for (const item of items) {
      expect(item.blurb.length).toBeGreaterThan(10);
      expect(hrefs.has(item.href)).toBe(false);
      hrefs.add(item.href);
    }
  });

  it("follows the league it was given", () => {
    const academy = siteDestinations("academy");
    expect(academy.find((item) => item.label === "Players")?.href).toBe("/academy/players");
    expect(academy.find((item) => item.label === "Cards")?.href).toBe("/academy/cards");
    expect(academy.find((item) => item.label === "FPL'dle")?.href).toBe("/academy/fpldle");
    // Premier-only games are not offered from the academy's point of view.
    expect(academy.find((item) => item.label === "The Gauntlet")).toBeUndefined();
    expect(siteDestinations("premier").find((item) => item.label === "The Gauntlet")?.href).toBe("/cards/gauntlet");
  });

  it("reaches the orphaned pages the audit found", () => {
    const hrefs = siteDestinations("premier").map((item) => item.href);
    for (const href of ["/supporters", "/cards/trades", "/fpldle", "/higher-lower", "/guess-the-card", "/box-score", "/cards/vault"]) {
      expect(hrefs).toContain(href);
    }
  });

  it("keeps cards sub-pages out of the top level but in the flat list", () => {
    const cards = siteDirectory("premier").find((group) => group.key === "cards")!;
    const top = cards.items.filter((item) => !item.nested).map((item) => item.label);
    expect(top).toEqual(["Cards", "My Collection", "Packs", "Browse", "Market", "Play"]);
    expect(cards.items.find((item) => item.label === "The Vault")?.nested).toBe(true);
  });
});
