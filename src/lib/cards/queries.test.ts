import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "./build";
import { backfillTeamIdentity } from "./queries";

/** A frozen copy as it sits in card_inventory: whatever the card looked like
 *  the moment it was pulled. Older copies predate both the badge lookup and
 *  the abbreviation, so both arrive missing. */
function frozen(overrides: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    slug: "7gen-na1",
    name: "7gen",
    tag: "NA1",
    teamName: "The Original Mocha House",
    teamImageUrl: null,
    teamAbbr: null,
    role: "Bot",
    overall: 74,
    tier: { key: "platinum", label: "Platinum" },
    archetype: "Glass Cannon",
    signature: { champion: "Jhin", games: 4 },
    artSkin: 0,
    motto: null,
    ...overrides,
  } as PlayerCardData;
}

const identity = {
  badges: new Map([["theoriginalmochahouse", "https://cdn.example/tom.png"]]),
  abbrs: new Map([["theoriginalmochahouse", "TOM9"]]),
};

describe("backfillTeamIdentity", () => {
  it("repairs both the badge and the abbreviation on an already-pulled copy", () => {
    // Team branding is the one thing a frozen copy is allowed to catch up on,
    // and the abbreviation is branding — without this, every card pulled
    // before this feature keeps wearing the long name over its signature.
    const [repaired] = backfillTeamIdentity([frozen()], identity);

    expect(repaired.teamImageUrl).toBe("https://cdn.example/tom.png");
    expect(repaired.teamAbbr).toBe("TOM9");
  });

  it("leaves a copy alone when it already carries both", () => {
    const already = frozen({ teamImageUrl: "https://cdn.example/old.png", teamAbbr: "OLD" });

    const [repaired] = backfillTeamIdentity([already], identity);

    expect(repaired.teamImageUrl).toBe("https://cdn.example/old.png");
    expect(repaired.teamAbbr).toBe("OLD");
  });

  it("leaves a teamless card untouched", () => {
    const [repaired] = backfillTeamIdentity([frozen({ teamName: null })], identity);

    expect(repaired.teamImageUrl).toBeNull();
    expect(repaired.teamAbbr).toBeNull();
  });
});
