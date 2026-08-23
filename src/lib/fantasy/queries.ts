// Reads over the fantasy tables. Framework-free (takes any SupabaseClient,
// no next/headers), same shape as src/lib/packs/queries.ts — pages pass a
// client in and a future scoring job under tsx reuses these unchanged.
//
// fantasy_lineups is publicly readable (20260826000015_card_packs_fantasy.sql)
// so the leaderboard renders for signed-out visitors with either client;
// fetchBettingUsernames reads betting_profiles, which is not, so hand that
// one the service client.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { LineupBreakdown, StoredSlots } from "./scoring";

/** One week's entry for one manager. */
export interface FantasyLineupRow {
  discordId: string;
  season: string;
  weekStart: string;
  slots: StoredSlots;
  totalOverall: number;
  submittedAt: string;
  /** Null until the week is graded. */
  score: number | null;
  breakdown: LineupBreakdown | null;
  paidOut: number | null;
  scoredAt: string | null;
}

interface LineupDbRow {
  discord_id: string;
  season: string;
  week_start: string;
  slots: StoredSlots;
  total_overall: number;
  submitted_at: string;
  score: number | string | null;
  breakdown: LineupBreakdown | null;
  paid_out: number | null;
  scored_at: string | null;
}

const LINEUP_COLUMNS = "discord_id, season, week_start, slots, total_overall, submitted_at, score, breakdown, paid_out, scored_at";

function mapLineup(row: LineupDbRow): FantasyLineupRow {
  return {
    discordId: row.discord_id,
    season: row.season,
    weekStart: row.week_start,
    slots: row.slots ?? {},
    totalOverall: row.total_overall,
    submittedAt: row.submitted_at,
    // `score` is a Postgres numeric, which PostgREST hands back as a string
    // once it stops fitting a JS number cleanly — coerce rather than trust.
    score: row.score === null ? null : Number(row.score),
    breakdown: row.breakdown,
    paidOut: row.paid_out,
    scoredAt: row.scored_at,
  };
}

/** One manager's entry for a week, or null if they didn't field one. Errors
 *  read as "no entry" — the builder should render empty rather than 500 when
 *  the migration hasn't reached this environment. */
export async function fetchLineup(
  supabase: SupabaseClient,
  discordId: string,
  season: string,
  weekStart: string,
): Promise<FantasyLineupRow | null> {
  const { data, error } = await supabase
    .from("fantasy_lineups")
    .select(LINEUP_COLUMNS)
    .eq("discord_id", discordId)
    .eq("season", season)
    .eq("week_start", weekStart)
    .maybeSingle();
  if (error || !data) return null;
  return mapLineup(data as LineupDbRow);
}

/** Every entry in one week, best score first (unscored entries last). The
 *  leaderboard's raw material — usernames are joined in by the caller with
 *  fetchBettingUsernames rather than by PostgREST, since betting_profiles
 *  isn't publicly readable and this query has to work for both clients. */
export async function fetchWeekLineups(
  supabase: SupabaseClient,
  season: string,
  weekStart: string,
): Promise<FantasyLineupRow[]> {
  const { data, error } = await supabase
    .from("fantasy_lineups")
    .select(LINEUP_COLUMNS)
    .eq("season", season)
    .eq("week_start", weekStart);
  if (error) return [];
  return ((data as LineupDbRow[]) ?? [])
    .map(mapLineup)
    .sort((a, b) => (b.score ?? -1) - (a.score ?? -1) || a.submittedAt.localeCompare(b.submittedAt));
}

/** Display names for a set of Discord ids. Service client only —
 *  betting_profiles has no public read policy. */
export async function fetchBettingUsernames(
  supabase: SupabaseClient,
  discordIds: string[],
): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  if (discordIds.length === 0) return names;
  const { data, error } = await supabase
    .from("betting_profiles")
    .select("discord_id, username")
    .in("discord_id", [...new Set(discordIds)]);
  if (error) return names;
  for (const row of (data as { discord_id: string; username: string | null }[]) ?? []) {
    names.set(row.discord_id, row.username ?? row.discord_id);
  }
  return names;
}

export interface FantasySeasonTotal {
  discordId: string;
  /** Scored weeks entered — the denominator behind a season average. */
  weeks: number;
  total: number;
}

/**
 * Season-long standings: each manager's scored weeks summed, best first.
 *
 * Aggregated in JS rather than SQL because there is no view for it and a
 * season is at most (managers × weeks) rows — a few hundred. Unscored weeks
 * are excluded entirely so a freshly submitted lineup doesn't read as a
 * zero-point week.
 */
export async function fetchSeasonTotals(supabase: SupabaseClient, season: string): Promise<FantasySeasonTotal[]> {
  const { data, error } = await supabase
    .from("fantasy_lineups")
    .select("discord_id, score, scored_at")
    .eq("season", season)
    .not("scored_at", "is", null);
  if (error) return [];

  const totals = new Map<string, FantasySeasonTotal>();
  for (const row of (data as { discord_id: string; score: number | string | null }[]) ?? []) {
    const entry = totals.get(row.discord_id) ?? { discordId: row.discord_id, weeks: 0, total: 0 };
    entry.weeks += 1;
    entry.total += Number(row.score ?? 0);
    totals.set(row.discord_id, entry);
  }
  return [...totals.values()]
    .map((entry) => ({ ...entry, total: Number(entry.total.toFixed(1)) }))
    .sort((a, b) => b.total - a.total);
}
