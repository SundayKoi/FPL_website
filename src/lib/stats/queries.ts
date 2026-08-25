// Thin fetchers over the five stats aggregate views (Task 2). Each accepts
// an optional season and phase filter and returns the view's rows typed per
// `./types.ts`. Omitting `season` queries every season's rows for that
// view — callers combine per-season rows client-side (see
// `combineSeasonRows` in `./formulas.ts`) for an "All seasons" display.
// Omitting `phase` (or passing "All") queries every phase.
//
// All five share the same shape deliberately (brief: "same-shaped fetchers
// for the other four views") so `StatsTabs` can wire any tab to its fetcher
// uniformly. Each `.eq()` call is written out per-fetcher rather than
// factored through a shared generic helper — Supabase's PostgrestFilterBuilder
// generics don't survive being threaded through a user-defined generic
// function (tsc reports "excessively deep" instantiation), so this trades a
// few repeated lines for types that actually check.

import { createClient } from "@/lib/supabase/client";
import type { HeadToHeadRow } from "./headToHead";
import type {
  ChampionAggRow,
  GameLogRow,
  PlayerAggRow,
  RecordRow,
  TeamAggRow,
} from "./types";

/**
 * Every row of a query, in pages.
 *
 * PostgREST caps a response at max_rows — 1000 here — and says nothing when
 * it does. An unpaged select therefore returns a plausible-looking prefix,
 * which is how a leaderboard quietly loses half a season and how the pack
 * shop quietly lost its oldest edition weeks. Every fetcher in this file
 * reads "all of X", so every one of them needs this.
 *
 * Takes a thunk that BUILDS the query for a page rather than a query to
 * page over: Supabase's PostgrestFilterBuilder generics do not survive
 * being threaded through a user-defined generic function (tsc reports
 * "excessively deep"), which is the same reason the .eq() chains below are
 * written out per-fetcher. Keeping the builder inside the caller keeps its
 * types intact and confines the cast to one place.
 *
 * The caller must order by something TOTAL. Paging on a non-unique key lets
 * the database repeat a row on one page and skip another, and a skipped row
 * is invisible — the failure this function exists to prevent.
 */
const PAGE_SIZE = 1000;
const MAX_PAGES = 100;

async function fetchAllPages<T>(
  buildPage: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>,
): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < MAX_PAGES; page += 1) {
    const from = page * PAGE_SIZE;
    const { data, error } = await buildPage(from, from + PAGE_SIZE - 1);
    if (error) throw error;
    const batch = (data as T[]) ?? [];
    rows.push(...batch);
    // A short page is the last page. Equal-to-PAGE_SIZE has to try again:
    // a result that exactly fills the window is indistinguishable from one
    // that was truncated by it.
    if (batch.length < PAGE_SIZE) break;
  }
  return rows;
}

export async function fetchPlayerKeysForTeams(teamNames: string[]): Promise<Set<string>> {
  if (!teamNames.length) return new Set();
  const supabase = createClient();
  const rows = await fetchAllPages<{ summoner_name: string; tag: string }>((from, to) =>
    supabase.from("raw_stats").select("id, summoner_name, tag").in("team_name", teamNames).order("id").range(from, to),
  );
  return new Set(rows.map((row) => `${row.summoner_name}#${row.tag}`.toLowerCase()));
}

export async function fetchChampionAggForTeams(season?: string, phase?: string, teamNames?: string[]): Promise<ChampionAggRow[]> {
  if (!teamNames) return fetchChampionAgg(season, phase);
  if (!teamNames.length) return [];
  const supabase = createClient();
  const rows = await fetchAllPages<{ champion: string | null; season: string; season_phase: string; match_id: string; win: boolean; kills: number; assists: number; deaths: number; ban_1: string | null; ban_2: string | null; ban_3: string | null; ban_4: string | null; ban_5: string | null }>((from, to) => {
    let query = supabase
      .from("raw_stats")
      .select("id, champion, season, season_phase, match_id, win, kills, assists, deaths, ban_1, ban_2, ban_3, ban_4, ban_5")
      .in("team_name", teamNames)
      .order("id")
      .range(from, to);
    if (season) query = query.eq("season", season);
    if (phase && phase !== "All") query = query.eq("season_phase", phase);
    return query;
  });
  const groups = new Map<string, { champion: string; season: string; season_phase: string; picks: number; wins: number; kills: number; assists: number; deaths: number; bans: Set<string> }>();
  const games = new Map<string, Set<string>>();
  for (const row of rows) {
    const scope = `${row.season}::${row.season_phase}`;
    const gameSet = games.get(scope) ?? new Set<string>();
    gameSet.add(row.match_id);
    games.set(scope, gameSet);
    const champions = [row.champion, row.ban_1, row.ban_2, row.ban_3, row.ban_4, row.ban_5].filter((value): value is string => Boolean(value));
    for (const champion of champions) {
      const key = `${champion}::${scope}`;
      const group = groups.get(key) ?? { champion, season: row.season, season_phase: row.season_phase, picks: 0, wins: 0, kills: 0, assists: 0, deaths: 0, bans: new Set<string>() };
      if (champion === row.champion) {
        group.picks += 1; group.wins += row.win ? 1 : 0; group.kills += row.kills; group.assists += row.assists; group.deaths += row.deaths;
      }
      if (champion !== row.champion) group.bans.add(`${row.match_id}::${champion}`);
      groups.set(key, group);
    }
  }
  return [...groups.values()].map((group) => {
    const gamesInScope = games.get(`${group.season}::${group.season_phase}`)?.size ?? 0;
    const bans = group.bans.size;
    const total = group.picks + bans;
    return { champion: group.champion, season: group.season, season_phase: group.season_phase, picks: group.picks, wins: group.wins, winrate_pct: group.picks ? Number((100 * group.wins / group.picks).toFixed(1)) : 0, avg_kda: Number(((group.kills + group.assists) / Math.max(group.deaths, 1)).toFixed(2)), bans, games_in_scope: gamesInScope, presence_pct: gamesInScope ? Number((100 * total / gamesInScope).toFixed(1)) : 0 };
  });
}

export async function fetchPlayerAgg(season?: string, phase?: string): Promise<PlayerAggRow[]> {
  const supabase = createClient();
  return fetchAllPages<PlayerAggRow>((from, to) => {
    let query = supabase
      .from("stats_player_agg")
      .select("*")
      // The view's own primary key, which is what makes the pages disjoint.
      .order("summoner_name").order("tag").order("season").order("season_phase")
      .range(from, to);
    if (season) query = query.eq("season", season);
    if (phase && phase !== "All") query = query.eq("season_phase", phase);
    return query;
  });
}

export async function fetchTeamAgg(season?: string, phase?: string, teamNames?: string[]): Promise<TeamAggRow[]> {
  if (teamNames && teamNames.length === 0) return [];
  const supabase = createClient();
  return fetchAllPages<TeamAggRow>((from, to) => {
    let query = supabase
      .from("stats_team_agg")
      .select("*")
      .order("team_name").order("season").order("season_phase")
      .range(from, to);
    if (season) query = query.eq("season", season);
    if (phase && phase !== "All") query = query.eq("season_phase", phase);
    if (teamNames?.length) query = query.in("team_name", teamNames);
    return query;
  });
}

export async function fetchChampionAgg(season?: string, phase?: string): Promise<ChampionAggRow[]> {
  const supabase = createClient();
  return fetchAllPages<ChampionAggRow>((from, to) => {
    let query = supabase
      .from("stats_champion_agg")
      .select("*")
      .order("champion").order("season").order("season_phase")
      .range(from, to);
    if (season) query = query.eq("season", season);
    if (phase && phase !== "All") query = query.eq("season_phase", phase);
    return query;
  });
}

export async function fetchRecords(season?: string, phase?: string, teamNames?: string[]): Promise<RecordRow[]> {
  if (teamNames && teamNames.length === 0) return [];
  const supabase = createClient();
  return fetchAllPages<RecordRow>((from, to) => {
    let query = supabase
      .from("stats_records")
      .select("*")
      // RecordsTab re-sorts by value, so this ordering is for paging only
      // and changes nothing on screen.
      .order("category").order("match_id").order("summoner_name").order("tag")
      .range(from, to);
    if (season) query = query.eq("season", season);
    if (phase && phase !== "All") query = query.eq("season_phase", phase);
    if (teamNames?.length) query = query.in("team_name", teamNames);
    return query;
  });
}

export async function fetchGameLog(season?: string, phase?: string): Promise<GameLogRow[]> {
  const supabase = createClient();
  return fetchAllPages<GameLogRow>((from, to) => {
    let query = supabase
      .from("stats_game_log")
      .select("*")
      // TimelineTab re-sorts by date; match_id is unique per game and makes
      // the pages disjoint.
      .order("match_id")
      .range(from, to);
    if (season) query = query.eq("season", season);
    if (phase && phase !== "All") query = query.eq("season_phase", phase);
    return query;
  });
}

/**
 * Comparator for season codes, newest first. Plain lexicographic sort would
 * put "S10" between "S1" and "S2" (string comparison), so this extracts the
 * numeric part of each code (`S10` -> 10) and compares those descending.
 * Codes with no numeric part (or ties on the numeric part) fall back to a
 * descending string compare, keeping the sort total and deterministic.
 * Exported (rather than kept private) so it's unit-testable without going
 * through the network fetcher below.
 */
export function compareSeasonsNewestFirst(a: string, b: string): number {
  const numA = parseInt(a.replace(/\D+/g, ""), 10);
  const numB = parseInt(b.replace(/\D+/g, ""), 10);
  const aHasNum = !Number.isNaN(numA);
  const bHasNum = !Number.isNaN(numB);
  if (aHasNum && bHasNum && numA !== numB) return numB - numA;
  if (aHasNum !== bHasNum) return aHasNum ? -1 : 1;
  return b.localeCompare(a);
}

/**
 * Distinct seasons present in `stats_game_log`, newest first (numeric-aware
 * — see `compareSeasonsNewestFirst`). Used by `SeasonSelect` to build its
 * option list and default to the newest season.
 */
/**
 * Every raw row the head-to-head matrix needs, PAGED.
 *
 * PostgREST caps a response at max_rows (1000). A season is ten rows per
 * game and runs well past that, so an unpaged select would silently return
 * the first thousand and the matrix would report matchups that stop
 * halfway through the season with no sign anything was missing.
 *
 * Ordered by id because pagination without a total order can overlap or
 * skip rows between requests.
 */
export async function fetchHeadToHeadRows(
  season?: string,
  phase?: string,
  teamNames?: string[],
): Promise<HeadToHeadRow[]> {
  const supabase = createClient();
  return fetchAllPages<HeadToHeadRow>((from, to) => {
    let query = supabase
      .from("raw_stats")
      .select("id, match_id, team_name, summoner_name, win")
      .order("id")
      .range(from, to);
    if (season) query = query.eq("season", season);
    if (phase && phase !== "All") query = query.eq("season_phase", phase);
    if (teamNames?.length) query = query.in("team_name", teamNames);
    return query;
  });
}

export async function fetchSeasons(): Promise<string[]> {
  const supabase = createClient();
  // One row per GAME for a handful of distinct seasons, so this crosses
  // max_rows long before the league runs out of seasons — and a truncated
  // read here drops a whole season out of the picker with no error.
  const rows = await fetchAllPages<{ season: string; match_id: string }>((from, to) =>
    supabase.from("stats_game_log").select("season, match_id").order("match_id").range(from, to),
  );
  const unique = Array.from(new Set(rows.map((row) => row.season)));
  return unique.sort(compareSeasonsNewestFirst);
}
