import type { SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it } from "vitest";
import { WEEKLY_STAT_COLUMNS } from "@/lib/stats/weekly";
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

/** One raw_stats row, complete enough for aggregateWeeklyPlayerRows to make
 *  a cohort member out of it. Only the name and the date matter here. */
function statRow(summonerName: string, gameDate: string) {
  return {
    summoner_name: summonerName,
    tag: "NA1",
    season: "S5",
    season_phase: "Regular",
    role: "MIDDLE",
    game_date: gameDate,
    match_id: `${summonerName}-1`,
    champion: "Ahri",
    win: true,
    team_name: "Storm",
    kills: 6,
    deaths: 2,
    assists: 7,
    cs: 220,
    total_damage_to_champions: 21000,
    game_duration_min: 30,
    gold_earned: 12000,
    vision_score: 20,
  };
}

/** A Supabase stand-in whose raw_stats read returns `rawRows` (and whose
 *  other tables come back empty), with the range filters recorded. */
function weekSupabase(
  rawRows: unknown[],
  captured: { column: string; value: unknown }[] = [],
  errors: Record<string, { message: string } | null> = {},
): SupabaseClient {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order", "maybeSingle"]) chain[m] = () => chain;
      chain.gte = (column: string, value: unknown) => { captured.push({ column, value }); return chain; };
      chain.lt = (column: string, value: unknown) => { captured.push({ column, value }); return chain; };
      chain.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) => {
        const error = errors[table] ?? null;
        return Promise.resolve({
          data: error ? null : table === "raw_stats" ? rawRows : [],
          error,
        }).then(resolve);
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("fetchWeekCards", () => {
  it("attributes a Sunday-night Eastern game to the week that just ended", async () => {
    // 23:00 ET on Sunday 2026-08-23 is 03:00 UTC on Monday 2026-08-24: a
    // window written in UTC query params files it under the NEXT edition,
    // and editions freeze at mint, so the misfiling is permanent. The week
    // boundary has to be mondayOf's — the one the whole app already uses.
    const supabase = weekSupabase([
      statRow("SundayNight", "2026-08-24T03:00:00.000Z"),
      statRow("MondayOpener", "2026-08-25T00:00:00.000Z"),
    ]);

    const cards = await fetchWeekCards(supabase, "S5", "2026-08-17");

    expect(cards.map((card) => card.name)).toEqual(["SundayNight"]);
  });

  it("starts the next week on Monday Eastern, not on the UTC Monday", async () => {
    const supabase = weekSupabase([
      statRow("SundayNight", "2026-08-24T03:00:00.000Z"),
      statRow("MondayOpener", "2026-08-25T00:00:00.000Z"),
    ]);

    const cards = await fetchWeekCards(supabase, "S5", "2026-08-24");

    expect(cards.map((card) => card.name)).toEqual(["MondayOpener"]);
  });

  it("fetches a UTC window wide enough to hold the whole Eastern week", async () => {
    // The range filters are deliberately loose — a day of padding either
    // side, which no ET offset can escape — because mondayOf does the
    // trimming. Narrow them back to the exact Monday-to-Monday UTC dates
    // and the Sunday-night game above never comes back from the database
    // at all, so the JS filter can no longer save it.
    const captured: { column: string; value: unknown }[] = [];
    await fetchWeekCards(weekSupabase([], captured), "S5", "2026-08-17");

    expect(captured).toContainEqual({ column: "game_date", value: "2026-08-16T00:00:00.000Z" });
    expect(captured).toContainEqual({ column: "game_date", value: "2026-08-25T00:00:00.000Z" });
  });

  it("throws when the week's stats fail to load rather than minting nothing", async () => {
    // A swallowed error reads exactly like a quiet week: data null -> no
    // games -> [] -> the drop logs "No cards — skipping" and the workflow
    // goes green, losing that edition forever.
    await expect(
      fetchWeekCards(weekSupabase([], [], { raw_stats: { message: "raw_stats exploded" } }), "S5", "2026-08-17"),
    ).rejects.toMatchObject({ message: "raw_stats exploded" });

    await expect(
      fetchWeekCards(weekSupabase([], [], { stats_game_log: { message: "game log exploded" } }), "S5", "2026-08-17"),
    ).rejects.toMatchObject({ message: "game log exploded" });
  });

  it("returns empty for a week that genuinely had no games", async () => {
    await expect(fetchWeekCards(weekSupabase([]), "S5", "2026-08-17")).resolves.toEqual([]);
  });

  it("selects every column the weekly aggregator reads from raw_stats", async () => {
    // Regression guard: fetchWeekCards feeds its raw_stats rows straight into
    // aggregateWeeklyPlayerRows to build the week's own cohort — there's no
    // separate agg view to fall back on the way fetchSeasonCards has. A
    // select narrowed back down to CARD_GAME_COLUMNS (the set fetchSeasonCards
    // needs) still returns rows and still builds cards, so this fails
    // silently: every stat the aggregator can't see (game_duration_min,
    // role, ...) reads as 0/UNKNOWN for the whole cohort instead of
    // erroring, which flattens every player's rating toward the middle. That
    // is exactly the bug caught in local-stack verification — a top card
    // that should have landed near 95 OVR came out 78 OVR/Emerald — and
    // because editions are frozen at mint, a silent recurrence would
    // permanently stamp a wrong week of cards. Asserted against
    // WEEKLY_STAT_COLUMNS (the aggregator's own documented column list, a
    // different module entirely) rather than the constant under test, so
    // this can't be satisfied by narrowing both together.
    const selects: { table: string; columns: string }[] = [];
    const supabase = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const m of ["eq", "order", "maybeSingle"]) chain[m] = () => chain;
        chain.select = (columns: string) => { selects.push({ table, columns }); return chain; };
        chain.gte = () => chain;
        chain.lt = () => chain;
        chain.then = (resolve: (r: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({ data: [], error: null }).then(resolve);
        return chain;
      },
    } as unknown as SupabaseClient;

    await fetchWeekCards(supabase, "S5", "2026-08-17");

    const rawStatsColumns = new Set(
      (selects.find((s) => s.table === "raw_stats")?.columns ?? "").split(",").map((c) => c.trim()),
    );
    const missing = WEEKLY_STAT_COLUMNS.filter((column) => !rawStatsColumns.has(column));
    expect(missing).toEqual([]);
  });
});
