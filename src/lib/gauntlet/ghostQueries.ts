// Finding last week's runs, so this week has someone to fight.
//
// Service client only: gauntlet_runs and the round log are both deny-all.
// Everything here pages with a total order on `id` — a bracket assembled
// from a silently truncated read would quietly stop offering the runs that
// happened later in the week.
//
// The SELECTION is pure and lives in ghosts.ts (chooseGhosts). This file
// only fetches.

import type { SupabaseClient } from "@supabase/supabase-js";
import { mondayOf } from "@/lib/packs/week";
import { chooseGhosts, type GhostBrief, type GhostCandidate, type GhostRun } from "./ghosts";
import { weekSeed } from "./opponents";
import { GAUNTLET_ROUNDS, type GauntletCard } from "./sim";

const GHOST_PAGE = 1000;
const GHOST_MAX_PAGES = 20;

/** The Monday before this one — where the bracket's people come from. */
export function previousWeekOf(weekStart: string): string {
  const date = new Date(`${weekStart}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() - 7);
  return mondayOf(date);
}

/** One paged, totally-ordered read. `filter` is applied BEFORE order and
 *  range, because .range() hands back a transform builder with no filters
 *  left on it. */
async function readAll<T>(
  service: SupabaseClient,
  table: string,
  columns: string,
  filter: (query: PostgrestFilter) => PostgrestFilter,
): Promise<T[]> {
  const rows: T[] = [];
  for (let index = 0; index < GHOST_MAX_PAGES; index += 1) {
    const { data, error } = await filter(service.from(table).select(columns) as unknown as PostgrestFilter)
      .order("id", { ascending: true })
      .range(index * GHOST_PAGE, index * GHOST_PAGE + GHOST_PAGE - 1);
    if (error) return rows;
    const batch = (data ?? []) as T[];
    rows.push(...batch);
    if (batch.length < GHOST_PAGE) return rows;
  }
  return rows;
}

/** The narrow slice of the query builder this file uses — enough to type
 *  the filter callbacks without dragging in PostgREST's generics. */
interface PostgrestFilter {
  eq: (column: string, value: string) => PostgrestFilter;
  in: (column: string, values: (string | number)[]) => PostgrestFilter;
  order: (column: string, opts: { ascending: boolean }) => {
    range: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>;
  };
}

interface LogRow {
  id: number;
  run_id: number;
  round: number;
  relics: string[] | null;
  choice_key: string | null;
}

interface RunRow {
  id: number;
  discord_id: string;
  lineup: GauntletCard[];
  lineup_avg: number;
  score: number;
}

/** Last week is over: nothing can be added to it, so a bracket assembled
 *  from it is immutable and safe to hold for the life of the instance.
 *  Keyed by the week being STAGED, small, and evicted oldest-first so a
 *  long-lived instance can't grow one entry per week forever. */
const BRACKET_CACHE = new Map<string, Map<number, GhostBrief>>();
const BRACKET_CACHE_MAX = 8;

/**
 * The week's eight opponents: real runs from last week, one per round,
 * nobody twice, chosen by the same week+round hash the rest of the cast
 * comes from — so the whole league fights the same people in the same
 * order and the leaderboard stays a comparison.
 *
 * Returns whatever it can. A round with no candidate is simply missing,
 * and the caller generates a team for it instead; an empty map (a fresh
 * season, a quiet week, the telemetry migration not yet applied) means the
 * mode plays exactly as it did before ghosts existed.
 */
export async function fetchGhostBracket(
  service: SupabaseClient,
  weekStart: string,
): Promise<Map<number, GhostBrief>> {
  const cached = BRACKET_CACHE.get(weekStart);
  if (cached) return cached;
  const lastWeek = previousWeekOf(weekStart);
  const logs = await readAll<LogRow>(
    service,
    "gauntlet_round_log",
    "id, run_id, round, relics, choice_key",
    (query) => query.eq("week_start", lastWeek),
  );
  if (logs.length === 0) return remember(weekStart, new Map());

  const runIds = [...new Set(logs.map((row) => row.run_id))];
  const runRows = await readAll<RunRow>(
    service,
    "gauntlet_runs",
    "id, discord_id, lineup, lineup_avg, score",
    (query) => query.in("id", runIds),
  );
  const runs = new Map<number, GhostRun>(
    runRows
      // A run whose lineup didn't survive (an old row, a bad write) is not
      // an opponent — better a generated team than a team of nobody.
      .filter((row) => Array.isArray(row.lineup) && row.lineup.length > 0)
      .map((row) => [
        row.id,
        {
          id: row.id,
          discordId: row.discord_id,
          lineup: row.lineup,
          lineupAvg: Number(row.lineup_avg),
          score: Number(row.score),
        },
      ]),
  );
  if (runs.size === 0) return remember(weekStart, new Map());

  const names = new Map<string, string>();
  const { data: profiles } = await service
    .from("betting_profiles")
    .select("discord_id, username")
    .in("discord_id", [...new Set([...runs.values()].map((run) => run.discordId))]);
  for (const row of (profiles ?? []) as { discord_id: string; username: string | null }[]) {
    if (row.username) names.set(row.discord_id, row.username);
  }

  const candidates: GhostCandidate[] = logs.map((row) => ({
    id: row.id,
    runId: row.run_id,
    round: row.round,
    relics: Array.isArray(row.relics) ? row.relics : [],
    choiceKey: row.choice_key,
  }));
  return remember(
    weekStart,
    chooseGhosts(
      candidates,
      runs,
      names,
      (round) => weekSeed(weekStart, round),
      Array.from({ length: GAUNTLET_ROUNDS }, (_, index) => index + 1),
    ),
  );
}

function remember(weekStart: string, bracket: Map<number, GhostBrief>): Map<number, GhostBrief> {
  if (BRACKET_CACHE.size >= BRACKET_CACHE_MAX) {
    const oldest = BRACKET_CACHE.keys().next().value;
    if (oldest !== undefined) BRACKET_CACHE.delete(oldest);
  }
  BRACKET_CACHE.set(weekStart, bracket);
  return bracket;
}
