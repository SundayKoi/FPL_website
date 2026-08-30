import { describe, expect, it, vi } from "vitest";

vi.mock("server-only", () => ({}));

import type { PlayerCardData } from "@/lib/cards/build";
import { resolvePremiumLeague, selectPreviewCard, selectPreviewCards } from "./preview";

function card(slug: string, name: string): PlayerCardData {
  return {
    slug,
    name,
    tag: "NA1",
    teamName: "FPL",
    teamImageUrl: null,
    role: "Mid",
    overall: 80,
    tier: { key: "emerald", label: "Emerald" },
    archetype: "Playmaker",
    signature: null,
    artSkin: 0,
    motto: null,
    serial: 1,
    collectionSize: 2,
    topChampions: [],
    form: [true, false],
    subStats: [],
    highlights: [],
    badges: [],
    standout: false,
    wins: 1,
    losses: 1,
    winratePct: 50,
    level: 2,
    pentas: 0,
    season: "S5",
  };
}

describe("Premium HQ preview selection", () => {
  it("accepts only the Academy toggle value", () => {
    expect(resolvePremiumLeague("academy")).toBe("academy");
    expect(resolvePremiumLeague("premier")).toBe("premier");
    expect(resolvePremiumLeague(undefined)).toBe("premier");
  });

  it("prefers the signed-in member's card when it is in the live collection", () => {
    const result = selectPreviewCard([card("one", "One"), card("two", "Two")], "two", () => 0);

    expect(result).toEqual({ card: expect.objectContaining({ slug: "two" }), selection: "own" });
  });

  it("falls back to a random live card when no owned card is available", () => {
    const result = selectPreviewCard([card("one", "One"), card("two", "Two")], null, () => 0.99);

    expect(result).toEqual({ card: expect.objectContaining({ slug: "two" }), selection: "random" });
  });

  it("returns no selection when the live collection is empty", () => {
    expect(selectPreviewCard([], null, () => 0)).toBeNull();
  });

  it("selects a different challenger card for the game preview", () => {
    const result = selectPreviewCards([card("one", "One"), card("two", "Two")], null, () => 0);

    expect(result).toEqual({
      card: expect.objectContaining({ slug: "one" }),
      challengerCard: expect.objectContaining({ slug: "two" }),
      selection: "random",
    });
  });
});
