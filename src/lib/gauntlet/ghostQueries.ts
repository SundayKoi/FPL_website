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
import { bountiesIn, chooseGhosts, type GhostBrief, type GhostCandidate, type GhostRun } from "./ghosts";
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

/** Last week is over: nothing can be added to it, so the POOL assembled
 *  from it is immutable and safe to hold for the life of the instance.
 *  Keyed by the week being staged, small, and evicted oldest-first so a
 *  long-lived instance can't grow one entry per week forever.
 *
 *  Note this caches the pool, not a bracket. Every run draws its own
 *  eight from it — see drawGhostBracket. */
const POOL_CACHE = new Map<string, GhostPool>();
const POOL_CACHE_MAX = 8;

/** Everything a private draw needs: who is available in which round, the
 *  runs behind them, their names, and which of them are bounties. */
export interface GhostPool {
  candidates: GhostCandidate[];
  runs: Map<number, GhostRun>;
  names: Map<string, string>;
  /** Last week's top finishers. Beating one pays extra — a target on the
   *  leaderboard that grinding cannot farm, because you do not choose
   *  whether you meet them. */
  bounties: Set<number>;
}

/**
 * The week's POOL of real opponents: every run from last week that got
 * far enough to stand somewhere, with the runs behind them and last
 * week's top finishers marked as bounties.
 *
 * Shared by the whole league and cached, because last week cannot change.
 * WHICH eight of them any given run meets is a separate, private question
 * — see drawGhostBracket.
 *
 * Returns whatever it can. An empty pool (a fresh season, a quiet week,
 * the telemetry migration not yet applied) means the mode plays exactly
 * as it did before ghosts existed.
 */
export async function fetchGhostPool(
  service: SupabaseClient,
  weekStart: string,
): Promise<GhostPool> {
  const cached = POOL_CACHE.get(weekStart);
  if (cached) return cached;
  const lastWeek = previousWeekOf(weekStart);
  const logs = await readAll<LogRow>(
    service,
    "gauntlet_round_log",
    "id, run_id, round, relics, choice_key",
    (query) => query.eq("week_start", lastWeek),
  );
  if (logs.length === 0) return remember(weekStart, emptyPool());

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
  if (runs.size === 0) return remember(weekStart, emptyPool());

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
  return remember(weekStart, { candidates, runs, names, bounties: bountiesIn(runs) });
}

/**
 * ONE run's eight opponents, drawn from the shared pool with the run's own
 * seed. Nobody twice, a missing round left to the generator — the same
 * rules the shared bracket had, and the same pure chooser.
 *
 * Passing the run's seed instead of the week's is the whole change, and
 * it is the one that stops a week from being solvable: the cast is a
 * shared population, the sequence is private, and the fifth attempt is as
 * unfamiliar as the first. A run staged before ghost_seed existed passes
 * null and keeps the week-seeded bracket it started with.
 */
export function drawGhostBracket(pool: GhostPool, ghostSeed: number | null, weekStart: string): Map<number, GhostBrief> {
  const seedFor = ghostSeed === null
    ? (round: number) => weekSeed(weekStart, round)
    : (round: number) => weekSeed(`${weekStart}#${ghostSeed}`, round);
  return chooseGhosts(
    pool.candidates,
    pool.runs,
    pool.names,
    seedFor,
    Array.from({ length: GAUNTLET_ROUNDS }, (_, index) => index + 1),
    pool.bounties,
  );
}

const emptyPool = (): GhostPool => ({
  candidates: [],
  runs: new Map(),
  names: new Map(),
  bounties: new Set(),
});

function remember(weekStart: string, pool: GhostPool): GhostPool {
  if (POOL_CACHE.size >= POOL_CACHE_MAX) {
    const oldest = POOL_CACHE.keys().next().value;
    if (oldest !== undefined) POOL_CACHE.delete(oldest);
  }
  POOL_CACHE.set(weekStart, pool);
  return pool;
}
