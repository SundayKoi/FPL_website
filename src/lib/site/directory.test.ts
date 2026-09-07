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
    for (const href of ["/supporters", "/cards/trades", "/fpldle", "/higher-lower", "/cards/vault"]) {
      expect(hrefs).toContain(href);
    }
  });

  it("marks what needs the role, and leaves the public doors open", () => {
    const items = siteDestinations("premier");
    const gated = (label: string) => items.find((item) => item.label === label)?.gated ?? false;
    for (const label of ["Packs", "My Collection", "Market", "Betting", "FPL'dle", "Match Drafter", "The Gauntlet"]) {
      expect(gated(label), label).toBe(true);
    }
    for (const label of ["Browse", "The Vault", "Moments", "Rarities", "Pack stats", "Premium HQ", "Schedule", "Glossary"]) {
      expect(gated(label), label).toBe(false);
    }
  });

  it("reaches the pages the second audit found missing, and the three new ones", () => {
    const hrefs = siteDestinations("premier").map((item) => item.href);
    for (const href of ["/betting/profile", "/identity-claims", "/skin-lines", "/my-team/scouting", "/membership", "/economy", "/glossary"]) {
      expect(hrefs).toContain(href);
    }
    // The leaderboard is a destination of its own, not a page under Betting.
    expect(siteDestinations("premier").find((item) => item.href === "/betting/leaderboard")?.nested).toBeFalsy();
    expect(siteDestinations("academy").map((item) => item.href)).toContain("/academy/my-team/scouting");
  });

  it("keeps cards sub-pages out of the top level but in the flat list", () => {
    const cards = siteDirectory("premier").find((group) => group.key === "cards")!;
    const top = cards.items.filter((item) => !item.nested).map((item) => item.label);
    expect(top).toEqual(["Cards", "My Collection", "Packs", "Browse", "Market", "Play"]);
    expect(cards.items.find((item) => item.label === "The Vault")?.nested).toBe(true);
  });
});
