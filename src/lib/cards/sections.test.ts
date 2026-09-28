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
    for (const page of ["teams", "compare", "moments", "season-end", "vault", "trades", "fantasy", "expeditions", "draw", "rarities"]) {
      expect(hrefs).toContain(`/cards/${page}`);
    }
  });

  it("offers the same Play tab in both leagues", () => {
    const labels = (base: string) =>
      cardsSections(base).find((section) => section.key === "play")!.children?.map((child) => child.label);
    expect(labels("/cards")).toEqual(["Fantasy", "Expeditions", "Expedition log", "Weekly prize draw"]);
    expect(labels("/academy/cards")).toEqual(labels("/cards"));
  });

  it("names pages in plain words, and still answers to their old names", () => {
    const children = cardsSections("/cards").flatMap((section) => section.children ?? []);
    const byHref = (href: string) => children.find((child) => child.href === href)!;
    expect(byHref("/cards/vault").label).toBe("Rarest cards");
    expect(byHref("/cards/vault").keywords).toContain("vault");
    expect(byHref("/cards/market/bounties").keywords).toContain("bounties");
    expect(byHref("/cards/expeditions/ledger").keywords).toContain("ledger");
    for (const jargon of ["Shelf", "Binder", "The Vault", "The ledger", "Bounties", "Trade offers"]) {
      expect(children.map((child) => child.label)).not.toContain(jargon);
    }
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
    expect(trades.child?.label).toBe("Trades");

    const vault = activeCardsSection(sections, "/cards/vault");
    expect(vault.section?.key).toBe("browse");
    expect(vault.child?.label).toBe("Rarest cards");
    expect(activeCardsSection(sections, "/cards/season-end").child?.label).toBe("Season awards");
    expect(activeCardsSection(sections, "/cards/season-end/copy/42").section?.key).toBe("browse");
  });

  it("lights the first sub-tab on the tab's own page", () => {
    const market = activeCardsSection(sections, "/cards/market");
    expect(market.child?.label).toBe("For sale");
    expect(activeCardsSection(sections, "/cards/market/bounties").child?.label).toBe("Wanted");
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

  it("carries a sub-page's whole path across", () => {
    expect(pairedCardsHref("/cards/market/bounties", "/cards", "/academy/cards")).toBe("/academy/cards/market/bounties");
  });

  it("falls back to the other hub from a page outside the section", () => {
    expect(pairedCardsHref("/betting", "/cards", "/academy/cards")).toBe("/academy/cards");
  });
});
