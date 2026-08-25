import { describe, expect, it } from "vitest";
import { dustValueOf } from "./config";
import { MOMENT_DUST, MOMENT_TIER, momentToCard } from "@/lib/cards/moments";

const moment = {
  id: 7,
  title: "PENTAKILL",
  headline: "Five in a row · 12/1/4",
  summonerName: "Ari",
  champion: "Jinx",
  teamName: "Wolves",
  role: "BOTTOM",
  weekStart: "2026-08-24",
  slug: "ari-na1",
};

describe("momentToCard", () => {
  it("carries the moment so the renderer can branch on it", () => {
    const card = momentToCard(moment, "S5");
    expect(card.moment?.title).toBe("PENTAKILL");
    expect(card.moment?.playerSlug).toBe("ari-na1");
    expect(card.season).toBe("S5");
  });

  it("gets a slug of its own, not the player's", () => {
    // Otherwise holding someone's moment would answer "do I own this
    // player" with yes, and two moments would collapse into one shelf entry.
    expect(momentToCard(moment, "S5").slug).toBe("moment-7");
    expect(momentToCard({ ...moment, id: 8 }, "S5").slug).toBe("moment-8");
  });

  it("carries a zero rating rather than an invented one", () => {
    const card = momentToCard(moment, "S5");
    expect(card.overall).toBe(0);
    expect(card.subStats).toEqual([]);
  });
});

describe("dustValueOf for moments", () => {
  it("prices a stored moment off its flat tier column", () => {
    expect(dustValueOf({ tier: MOMENT_TIER, foil: false, signed: false })).toBe(MOMENT_DUST);
  });

  it("prices one off the flag when the caller holds the card json", () => {
    expect(dustValueOf({ tier: "gold", foil: false, signed: false, moment: true })).toBe(MOMENT_DUST);
  });

  it("does not let foil or signed inflate a moment", () => {
    // A moment has no tier to double and cannot be autographed; the flat
    // price is the whole price.
    expect(dustValueOf({ tier: MOMENT_TIER, foil: true, signed: true })).toBe(MOMENT_DUST);
  });

  it("leaves ordinary cards priced exactly as before", () => {
    // gold is a COMMON tier in RARITY_BY_TIER, not an epic one.
    expect(dustValueOf({ tier: "gold", foil: false, signed: false })).toBe(10);
    expect(dustValueOf({ tier: "diamond", foil: false, signed: false })).toBe(60);
    expect(dustValueOf({ tier: "diamond", foil: true, signed: false })).toBe(120);
  });

  it("still sits below a signed copy, so the autograph stays the top price", () => {
    expect(MOMENT_DUST).toBeLessThan(dustValueOf({ tier: "bronze", foil: false, signed: true }));
  });
});
