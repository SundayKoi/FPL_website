import { describe, expect, it } from "vitest";
import { activeCardsSection, cardsSections, pairedCardsHref } from "./sections";

describe("cardsSections", () => {
  it("is six tabs, in the order a visitor's questions come", () => {
    // Where are my cards, how do I get more, what is there, what can I do.
    expect(cardsSections("/cards").map((section) => section.label)).toEqual([
      "Home",
      "My Collection",
      "Packs",
      "Browse",
      "Market",
      "Play",
    ]);
  });

  it("points every destination at the league it was given", () => {
    const hrefs = cardsSections("/academy/cards").flatMap((section) => [
      section.href,
      ...(section.children ?? []).map((child) => child.href),
    ]);
    for (const href of hrefs) expect(href.startsWith("/academy/cards")).toBe(true);
  });

  it("keeps every old destination reachable as a sub-tab", () => {
    const hrefs = cardsSections("/cards").flatMap((section) => (section.children ?? []).map((child) => child.href));
    for (const page of ["teams", "compare", "moments", "vault", "trades", "fantasy", "gauntlet", "expeditions", "draw", "stats", "rarities"]) {
      expect(hrefs).toContain(`/cards/${page}`);
    }
  });

  it("leaves the Gauntlet and Showdown off the academy's Play tab, which has no such pages", () => {
    const play = cardsSections("/academy/cards").find((section) => section.key === "play")!;
    expect(play.children?.map((child) => child.label)).not.toContain("Gauntlet");
    expect(play.children?.map((child) => child.label)).not.toContain("Showdown");
    const premier = cardsSections("/cards").find((section) => section.key === "play")!;
    expect(premier.children?.map((child) => child.href)).toContain("/cards/showdown");
  });

  it("gives every tab and sub-tab a line saying what it is", () => {
    for (const section of cardsSections("/cards")) {
      expect(section.blurb.length).toBeGreaterThan(10);
      for (const child of section.children ?? []) expect(child.blurb.length).toBeGreaterThan(10);
    }
  });
});

describe("activeCardsSection", () => {
  const sections = cardsSections("/cards");

  it("lights Home only on the hub itself, never by prefix", () => {
    expect(activeCardsSection(sections, "/cards").section?.key).toBe("home");
    expect(activeCardsSection(sections, "/cards/packs").section?.key).toBe("packs");
  });

  it("lights the parent tab and the sub-tab a page sits under", () => {
    const trades = activeCardsSection(sections, "/cards/trades");
    expect(trades.section?.key).toBe("market");
    expect(trades.child?.label).toBe("Trade offers");

    const vault = activeCardsSection(sections, "/cards/vault");
    expect(vault.section?.key).toBe("browse");
    expect(vault.child?.label).toBe("The Vault");
  });

  it("lights the first sub-tab on the tab's own page", () => {
    const market = activeCardsSection(sections, "/cards/market");
    expect(market.child?.label).toBe("Listings");
    expect(activeCardsSection(sections, "/cards/market/bounties").child?.label).toBe("Bounties");
  });

  it("lights nothing on a page the map does not know", () => {
    expect(activeCardsSection(sections, "/cards/claims").section).toBeNull();
    expect(activeCardsSection(sections, "/betting").section).toBeNull();
  });
});

describe("pairedCardsHref", () => {
  it("keeps the same page when switching league", () => {
    expect(pairedCardsHref("/cards/market", "/cards", "/academy/cards")).toBe("/academy/cards/market");
    expect(pairedCardsHref("/academy/cards/vault", "/academy/cards", "/cards")).toBe("/cards/vault");
  });

  it("sends a premier-only page to the other league's Play tab instead of a 404", () => {
    expect(pairedCardsHref("/cards/gauntlet", "/cards", "/academy/cards")).toBe("/academy/cards/play");
  });

  it("falls back to the other hub from a page outside the section", () => {
    expect(pairedCardsHref("/betting", "/cards", "/academy/cards")).toBe("/academy/cards");
  });
});
