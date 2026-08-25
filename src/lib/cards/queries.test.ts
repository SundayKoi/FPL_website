import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "./build";
import { backfillTeamIdentity, fetchWeekCards } from "./queries";

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

describe("fetchWeekCards", () => {
  it("rates a player on the requested week's games alone", async () => {
    const inWeek = { game_date: "2026-08-17T20:00:00Z", match_id: "NA1_1" };
    const nextWeek = { game_date: "2026-08-24T20:00:00Z", match_id: "NA1_9" };
    const captured: { column: string; value: unknown }[] = [];
    const supabase = {
      from: () => {
        const chain: Record<string, unknown> = {};
        for (const m of ["select", "eq", "order", "maybeSingle"]) chain[m] = () => chain;
        chain.gte = (column: string, value: unknown) => { captured.push({ column, value }); return chain; };
        chain.lt = (column: string, value: unknown) => { captured.push({ column, value }); return chain; };
        chain.then = (resolve: (r: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve);
        return chain;
      },
    } as unknown as SupabaseClient;

    await fetchWeekCards(supabase, "S5", "2026-08-17");

    // The window must be half-open on the following Monday, so a game played
    // at 23:59 Sunday counts and the next week's opener does not.
    expect(captured).toContainEqual({ column: "game_date", value: "2026-08-17T00:00:00.000Z" });
    expect(captured).toContainEqual({ column: "game_date", value: "2026-08-24T00:00:00.000Z" });
    void inWeek; void nextWeek;
  });
});
