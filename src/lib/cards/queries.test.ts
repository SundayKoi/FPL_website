import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { describe, expect, it, vi } from "vitest";
import { WEEKLY_STAT_COLUMNS } from "@/lib/stats/weekly";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { PlayerCardData } from "./build";
import {
  backfillTeamIdentity,
  fetchCardEditionWeeks,
  fetchCurrentWeekCards,
  fetchEditionWeekInfo,
  fetchSeasonCards,
  fetchWeekCards,
  fetchWeekMoments,
} from "./queries";

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
  colors: new Map([["theoriginalmochahouse", "#c8102e"]]),
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
      let from = 0;
      let to = rawRows.length;
      chain.range = (start: number, end: number) => { from = start; to = end + 1; return chain; };
      for (const m of ["select", "eq", "order", "maybeSingle"]) chain[m] = () => chain;
      chain.gte = (column: string, value: unknown) => { captured.push({ column, value }); return chain; };
      chain.lt = (column: string, value: unknown) => { captured.push({ column, value }); return chain; };
      chain.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) => {
        const error = errors[table] ?? null;
        return Promise.resolve({
          data: error ? null : table === "raw_stats" ? rawRows.slice(from, to) : [],
          error,
        }).then(resolve);
      };
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("fetchWeekCards", () => {
  it("includes players beyond the API's first thousand raw rows", async () => {
    const rows = Array.from({ length: 1000 }, (_, i) => ({ ...statRow("Regular", "2026-08-18T00:00:00Z"), match_id: `m${i}` }));
    rows.push(statRow("LateArrival", "2026-08-18T00:00:00Z"));
    const cards = await fetchWeekCards(weekSupabase(rows), "S5", "2026-08-17");
    expect(cards.map((card) => card.name)).toContain("LateArrival");
    expect(cards.find((card) => card.name === "Regular")?.level).toBe(1000);
  });

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
        for (const m of ["eq", "order", "maybeSingle", "range"]) chain[m] = () => chain;
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

/** A Supabase stand-in for the whole live-card path: the latest game week
 *  comes off raw_stats, the bracket off fixtures, and every table it asks
 *  for is recorded so a test can tell which of the two builds ran. */
function currentWeekSupabase(fixtures: unknown[], rawRows: unknown[], tables: string[] = []): SupabaseClient {
  return {
    from: (table: string) => {
      tables.push(table);
      const chain: Record<string, unknown> = {};
      const data = table === "fixtures" ? fixtures : table === "raw_stats" ? rawRows : [];
      for (const m of ["select", "eq", "not", "order", "range", "limit", "gte", "lt"]) chain[m] = () => chain;
      // fetchLatestGameWeek's one-row read.
      chain.maybeSingle = async () => ({ data: (rawRows[0] as { game_date: string }) ?? null, error: null });
      chain.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data, error: null }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("fetchCurrentWeekCards", () => {
  const playoffFixture = {
    stage: "semifinals",
    team_a: "Storm",
    team_b: "Ember",
    score_a: 2,
    score_b: 0,
    // 8 PM ET on Monday 2026-08-17.
    scheduled_at: "2026-08-18T00:00:00.000Z",
  };

  it("reads both builds during the bracket: the fallen season-rated, everyone still in on the week", async () => {
    // A playoff week's cohort is whoever is still in it — 40 people, then
    // 20, then 10 — so rating a knocked-out finalist against the nine other
    // people who played the final prints a bad card for reaching it: a
    // team whose split has ended comes out of the season build
    // (stats_player_agg) wearing its send-off. Everyone still in is a
    // player of the week like any other week, out of raw_stats.
    const tables: string[] = [];
    const cards = await fetchCurrentWeekCards(
      currentWeekSupabase([playoffFixture], [statRow("Finalist", "2026-08-18T00:00:00Z")], tables),
      "S5",
    );

    expect(tables).toContain("stats_player_agg");
    expect(tables).toContain("raw_stats");
    // Storm won this one, so its player prints as the week's card, unstamped.
    expect(cards.map((card) => card.name)).toEqual(["Finalist"]);
    expect(cards[0].sendoff).toBeUndefined();
  });

  it("stays on the week's own build outside the bracket", async () => {
    const tables: string[] = [];
    await fetchCurrentWeekCards(
      currentWeekSupabase(
        [{ ...playoffFixture, stage: "week_5" }],
        [statRow("Regular", "2026-08-18T00:00:00Z")],
        tables,
      ),
      "S5",
    );

    expect(tables).not.toContain("stats_player_agg");
  });
});

/** A Supabase stand-in that hands each table whatever `tables` holds for
 *  it and [] for everything else — the same shape the rest of these mocks
 *  use, wide enough for fetchSeasonCards's six-way read. */
function tableSupabase(tables: Record<string, unknown[]>): SupabaseClient {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "not", "order", "range", "limit", "gte", "lt"]) chain[m] = () => chain;
      chain.maybeSingle = async () => ({ data: null, error: null });
      chain.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: tables[table] ?? [], error: null }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

/** A stats_player_agg row, only the columns the rating engine reads. */
function aggRow(summonerName: string, over: Partial<PlayerAggRow> = {}): PlayerAggRow {
  return {
    summoner_name: summonerName, tag: "NA1", season: "S5", season_phase: "Regular", role_mode: "MIDDLE",
    games: 5, wins: 3, winrate_pct: 60, avg_kills: 4, avg_deaths: 4, avg_assists: 6, kda: 2.5, avg_kp_pct: 55,
    avg_cs_per_min: 6, avg_gold_per_min: 350, avg_dmg_per_min: 500, avg_dmg_share_pct: 20, avg_vision_per_min: 1,
    avg_solo_kills: 1, total_kills: 20, total_deaths: 20, total_assists: 30, total_solo_kills: 5, total_plates: 5,
    total_doubles: 1, total_triples: 0, total_quadras: 0, total_pentas: 0, avg_cs_at_10: 70, avg_gold_at_10: 3200,
    avg_xp_at_10: 4000, avg_dmg_taken_per_min: 400, avg_kda_challenges: 2.5, first_blood_involvements: 1,
    avg_game_duration: 30,
    ...over,
  } as PlayerAggRow;
}

/** One raw_stats row as fetchSeasonCards reads it — the name, the date and
 *  the result are all the playoff run counts. */
function seasonGame(summonerName: string, gameDate: string, win: boolean, matchId: string) {
  return {
    summoner_name: summonerName, tag: "NA1", champion: "Ahri", win, game_date: gameDate, match_id: matchId,
    team_name: "Storm", kills: 5, deaths: 3, assists: 7, cs: 200, total_damage_to_champions: 20000,
  };
}

describe("fetchSeasonCards", () => {
  // The bracket's Monday night, 8 PM ET, and a regular-season Tuesday well
  // before it.
  const PLAYOFF_NIGHT = "2026-09-08T00:00:00.000Z";
  const REGULAR_NIGHT = "2026-09-02T00:00:00.000Z";

  it("attaches each card's playoff run, cut at the bracket's first week", async () => {
    // The sub the record line exists for: two regular-season games, then
    // the gauntlet night — won round 1, lost round 2 0-2. The season says
    // 3-2, which beside a GAUNTLET stamp reads as a series score; the run
    // is 1-2. "Bench" never played in the bracket at all.
    const cards = await fetchSeasonCards(
      tableSupabase({
        stats_player_agg: [aggRow("Sub"), aggRow("Bench")],
        raw_stats: [
          seasonGame("Sub", REGULAR_NIGHT, true, "m1"),
          seasonGame("Sub", REGULAR_NIGHT, true, "m2"),
          seasonGame("Sub", PLAYOFF_NIGHT, true, "m3"),
          seasonGame("Sub", PLAYOFF_NIGHT, false, "m4"),
          seasonGame("Sub", PLAYOFF_NIGHT, false, "m5"),
          seasonGame("Bench", REGULAR_NIGHT, true, "m6"),
        ],
        fixtures: [{
          stage: "finals", team_a: "Storm", team_b: "Ember",
          score_a: null, score_b: null, scheduled_at: PLAYOFF_NIGHT,
        }],
      }),
      "S5",
    );

    expect(cards.find((c) => c.name === "Sub")?.playoffs).toEqual({ wins: 1, losses: 2 });
    expect(cards.find((c) => c.name === "Bench")?.playoffs).toBeNull();
    // The season build itself is untouched — only a send-off swaps the line.
    expect(cards.find((c) => c.name === "Sub")).toMatchObject({ wins: 3, losses: 2, winratePct: 60 });
  });

  it("attaches no run at all before the bracket is scheduled", async () => {
    const cards = await fetchSeasonCards(
      tableSupabase({
        stats_player_agg: [aggRow("Sub")],
        raw_stats: [seasonGame("Sub", REGULAR_NIGHT, true, "m1")],
        fixtures: [{
          stage: "week_5", team_a: "Storm", team_b: "Ember",
          score_a: 2, score_b: 0, scheduled_at: REGULAR_NIGHT,
        }],
      }),
      "S5",
    );

    expect(cards[0].playoffs).toBeUndefined();
  });
});

describe("the style rating's data", () => {
  /** Every raw_stats column the style rating reads from a game — listed
   *  here rather than imported from queries.ts, so narrowing the select and
   *  this list together cannot make the test pass. */
  const STYLE_READS = [
    "role", "game_duration_min", "champion", "match_id", "team_name", "kills", "assists", "cs",
    "total_damage_to_champions", "damage_share_pct", "damage_taken", "damage_mitigated", "solo_kills",
    "time_ccing_others_s", "effective_heal_and_shield", "turret_damage", "cs_at_10", "gold_at_10", "xp_at_10",
  ];

  function selectCapturing(selects: { table: string; columns: string }[]): SupabaseClient {
    return {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const m of ["eq", "not", "order", "range", "limit", "gte", "lt"]) chain[m] = () => chain;
        chain.select = (columns: string) => { selects.push({ table, columns }); return chain; };
        chain.maybeSingle = async () => ({ data: null, error: null });
        chain.then = (resolve: (r: { data: unknown; error: null }) => unknown) => Promise.resolve({ data: [], error: null }).then(resolve);
        return chain;
      },
    } as unknown as SupabaseClient;
  }

  const missingFrom = (selects: { table: string; columns: string }[]) => {
    const columns = new Set((selects.find((s) => s.table === "raw_stats")?.columns ?? "").split(",").map((c) => c.trim()));
    return STYLE_READS.filter((column) => !columns.has(column));
  };

  it("is selected by the weekly build", async () => {
    // A missing column does not error: the stat silently grades as absent
    // for everyone, and a frozen edition would keep that forever.
    const selects: { table: string; columns: string }[] = [];
    await fetchWeekCards(selectCapturing(selects), "S6", "2026-10-05");
    expect(missingFrom(selects)).toEqual([]);
  });

  it("is selected by the season build, which rates a whole split", async () => {
    const selects: { table: string; columns: string }[] = [];
    await fetchSeasonCards(selectCapturing(selects), "S6");
    expect(missingFrom(selects)).toEqual([]);
  });

  it("rates S6 by playstyle and leaves S5 exactly as it was", async () => {
    const week = (season: string) => ["A", "B", "C", "D"].map((name) => ({ ...statRow(name, "2026-10-06T00:30:00Z"), season }));
    const s6 = await fetchWeekCards(weekSupabase(week("S6")), "S6", "2026-10-05");
    const s5 = await fetchWeekCards(weekSupabase(week("S5")), "S5", "2026-10-05");
    expect(s6[0].subStats.map((stat) => stat.key)).toEqual(["style", "laning", "survival", "teamplay", "vision"]);
    // Ahri mid is graded as a mage.
    expect(s6[0].subStats[0].label).toBe("Mage");
    expect(s5[0].subStats[0].key).toBe("combat");
  });
});

/** A Supabase stand-in for card_editions that pages: `pages` is handed out
 *  one `.range()` call at a time, so a test can prove the reader keeps
 *  going past the first 1000-row response. */
function editionsSupabase(pages: { edition_week: string }[][], error: { message: string } | null = null) {
  const ranges: [number, number][] = [];
  const orders: string[] = [];
  const client = {
    from: () => {
      const chain: Record<string, unknown> = {};
      chain.select = () => chain;
      chain.eq = () => chain;
      chain.order = (column: string) => {
        orders.push(column);
        return chain;
      };
      chain.range = (from: number, to: number) => {
        ranges.push([from, to]);
        const page = pages[ranges.length - 1] ?? [];
        return Promise.resolve({ data: error ? null : page, error });
      };
      return chain;
    },
  } as unknown as SupabaseClient;
  return { client, ranges, orders };
}

describe("fetchCardEditionWeeks", () => {
  it("keeps reading past the first page", async () => {
    // PostgREST caps an unpaged select at max_rows and says nothing about
    // it. At ~50 cards a week the archive crosses 1000 rows after about
    // twenty weeks, and because the order is newest-first the rows that
    // fall off the end are the OLDEST weeks — they would simply stop
    // appearing in the pack shop with no error to explain it.
    const full = Array.from({ length: 3 }, () => ({ edition_week: "2026-08-24" }));
    const { client } = editionsSupabase([full, [{ edition_week: "2026-08-17" }]]);

    const weeks = await fetchCardEditionWeeks(client, "S5", { pageSize: 3 });

    expect(weeks).toEqual(["2026-08-24", "2026-08-17"]);
  });

  it("stops on the first short page rather than requesting forever", async () => {
    const { client, ranges } = editionsSupabase([[{ edition_week: "2026-08-24" }]]);

    await fetchCardEditionWeeks(client, "S5", { pageSize: 3 });

    expect(ranges).toEqual([[0, 2]]);
  });

  it("orders by slug as well as week, so pages cannot skip a row", async () => {
    // Thousands of rows share an edition_week. Paging on a non-unique sort
    // key lets the database repeat a row on one page and skip another; the
    // Set absorbs a repeat, but a skip could drop a whole week.
    const { client, orders } = editionsSupabase([[]]);

    await fetchCardEditionWeeks(client, "S5");

    expect(orders).toEqual(["edition_week", "slug"]);
  });

  it("returns nothing when the table is not there yet", async () => {
    const { client } = editionsSupabase([[]], { message: "relation does not exist" });

    expect(await fetchCardEditionWeeks(client, "S5")).toEqual([]);
  });

  it("can surface edition read failures for strict callers", async () => {
    const { client } = editionsSupabase([[]], { message: "relation does not exist" });

    await expect(fetchCardEditionWeeks(client, "S5", { throwOnError: true }))
      .rejects.toMatchObject({ message: "relation does not exist" });
  });

  it("keeps the weeks it already collected when a later page fails", async () => {
    const pages = [[{ edition_week: "2026-08-24" }, { edition_week: "2026-08-24" }]];
    let call = 0;
    const client = {
      from: () => {
        const chain: Record<string, unknown> = {};
        chain.select = () => chain;
        chain.eq = () => chain;
        chain.order = () => chain;
        chain.range = () => {
          call += 1;
          return call === 1
            ? Promise.resolve({ data: pages[0], error: null })
            : Promise.resolve({ data: null, error: { message: "timeout" } });
        };
        return chain;
      },
    } as unknown as SupabaseClient;

    // Losing the whole list because page two timed out would empty the pack
    // shop's week picker; a partial list still sells packs.
    expect(await fetchCardEditionWeeks(client, "S5", { pageSize: 2 })).toEqual(["2026-08-24"]);
  });
});

/** card_editions hands back one page of weeks; fixtures hand back the
 *  bracket. Everything fetchEditionWeekInfo reads, and nothing else. */
function editionInfoSupabase(weeks: string[], fixtures: unknown[]): SupabaseClient {
  return {
    from: (table: string) => {
      const chain: Record<string, unknown> = {};
      for (const m of ["select", "eq", "order"]) chain[m] = () => chain;
      chain.range = async () => ({ data: weeks.map((edition_week) => ({ edition_week })), error: null });
      chain.then = (resolve: (r: { data: unknown; error: unknown }) => unknown) =>
        Promise.resolve({ data: table === "fixtures" ? fixtures : [], error: null }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("fetchEditionWeekInfo", () => {
  // 8 PM ET on Monday 2026-08-31 — the finals.
  const finals = {
    stage: "finals",
    team_a: "Storm",
    team_b: "Ember",
    score_a: 3,
    score_b: 1,
    scheduled_at: "2026-09-01T00:00:00.000Z",
  };

  it("names a send-off by its round and numbers only the weekly prints", async () => {
    // A send-off in the middle of the picker must not push the weekly
    // numbering out of step with how people talk about the weeks.
    const client = editionInfoSupabase(["2026-08-17", "2026-08-24", "2026-08-31"], [finals]);

    const info = await fetchEditionWeekInfo(client, "S5", new Date("2026-09-02T00:00:00.000Z"));

    expect(info.map((row) => row.label)).toEqual(["Send-off · Finals", "Week 2 · Aug 24", "Week 1 · Aug 17"]);
    expect(info[0].sendoff).toEqual({ closesAt: "2026-09-15T00:00:00.000Z" });
    expect(info[1].sendoff).toBeNull();
  });

  it("drops a vaulted send-off off the shelf entirely", async () => {
    // Offering a week the opener will refuse is worse than not offering it.
    const client = editionInfoSupabase(["2026-08-24", "2026-08-31"], [finals]);

    const info = await fetchEditionWeekInfo(client, "S5", new Date("2026-09-16T00:00:00.000Z"));

    expect(info.map((row) => row.week)).toEqual(["2026-08-24"]);
  });
});

it("requests only the selected week's moments through the Supabase transport", async () => {
  const urls: URL[] = [];
  const fetch = vi.fn(async (input: RequestInfo | URL) => {
    const url = new URL(String(input));
    urls.push(url);
    return new Response(JSON.stringify([{ id: 1, week_start: "2026-08-17", slug: "one", summoner_name: "One", duration_min: "32.5" }]), { status: 200 });
  });
  const client = createClient("http://127.0.0.1:54321", "test-anon", {
    global: { fetch }, auth: { persistSession: false, autoRefreshToken: false },
  });
  const moments = await fetchWeekMoments(client, "S5", "2026-08-17");
  expect(urls).toHaveLength(1);
  expect(urls[0].searchParams.get("season")).toBe("eq.S5");
  expect(urls[0].searchParams.get("week_start")).toBe("eq.2026-08-17");
  expect(moments[0]).toMatchObject({ weekStart: "2026-08-17", durationMin: 32.5 });
});
