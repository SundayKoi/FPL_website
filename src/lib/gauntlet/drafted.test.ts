import { describe, expect, it } from "vitest";
import { DRAFTED_HAND_PER_ROLE, dealHand, lineupFromHand } from "./drafted";
import { mulberry32 } from "./sim";

const options = {
  Top: [{ inventoryId: 1 }, { inventoryId: 2 }, { inventoryId: 3 }, { inventoryId: 4 }, { inventoryId: 5 }],
  Jungle: [{ inventoryId: 10 }, { inventoryId: 11 }],
  Mid: [{ inventoryId: 20 }, { inventoryId: 21 }, { inventoryId: 22 }, { inventoryId: 23 }],
  Bot: [],
  Support: [{ inventoryId: 40 }],
};

describe("dealHand", () => {
  it("deals up to three per role without replacement, what a thin role has, nothing for an empty one", () => {
    const hand = dealHand(options, mulberry32(7));
    expect(hand.filter((id) => id < 10)).toHaveLength(DRAFTED_HAND_PER_ROLE);
    expect(hand.filter((id) => id >= 10 && id < 20)).toHaveLength(2);
    expect(hand.filter((id) => id >= 20 && id < 30)).toHaveLength(DRAFTED_HAND_PER_ROLE);
    expect(hand.filter((id) => id >= 40)).toHaveLength(1);
    expect(new Set(hand).size).toBe(hand.length);
  });

  it("is the same hand for the same seed, a different one for another", () => {
    expect(dealHand(options, mulberry32(7))).toEqual(dealHand(options, mulberry32(7)));
    const seeds = [1, 2, 3, 4, 5].map((seed) => dealHand(options, mulberry32(seed)).join("|"));
    expect(new Set(seeds).size).toBeGreaterThan(1);
  });
});

describe("lineupFromHand", () => {
  it("accepts a five from the hand with trialists, refuses a card that was not dealt", () => {
    expect(lineupFromHand([1, 10, 20, null, 40], [1, 10, 20, 40])).toBe(true);
    expect(lineupFromHand([1, 10, 21, null, 40], [1, 10, 20, 40])).toBe(false);
  });
});
