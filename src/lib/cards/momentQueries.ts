// The season's minted moment cards. Split out of queries.ts, which
// re-exports every name here.

import type { SupabaseClient } from "@supabase/supabase-js";

export interface LeagueMoment {
  id: number;
  weekStart: string;
  slug: string;
  summonerName: string;
  teamName: string | null;
  champion: string | null;
  role: string | null;
  triggerKey: string;
  title: string;
  headline: string;
  gameDate: string | null;
  /** Provenance the Signature print shows — null on moments minted before
   *  the columns existed (the backfill migration repairs those). */
  opponent: string | null;
  durationMin: number | null;
}

/**
 * The season's minted moment cards, newest first.
 *
 * Errors return [] rather than throwing: an environment without the
 * card_moments migration should render an empty wall, not a 500.
 */
async function fetchMoments(supabase: SupabaseClient, season: string, weekStart?: string): Promise<LeagueMoment[]> {
  // select("*") on purpose: opponent/duration_min arrive in a later
  // migration than the table, and naming them here would blank the whole
  // wall on a deploy that beat the migration.
  let query = supabase
    .from("card_moments")
    .select("*")
    .eq("season", season)
    .order("week_start", { ascending: false })
    .order("rarity", { ascending: false });
  if (weekStart !== undefined) query = query.eq("week_start", weekStart);
  const { data, error } = await query;
  if (error) return [];
  return ((data as {
    id: number;
    week_start: string;
    slug: string;
    summoner_name: string;
    team_name: string | null;
    champion: string | null;
    role: string | null;
    trigger_key: string;
    title: string;
    headline: string;
    game_date: string | null;
    opponent?: string | null;
    duration_min?: number | null;
  }[]) ?? []).map((row) => ({
    id: row.id,
    weekStart: row.week_start,
    slug: row.slug,
    summonerName: row.summoner_name,
    teamName: row.team_name,
    champion: row.champion,
    role: row.role,
    triggerKey: row.trigger_key,
    title: row.title,
    headline: row.headline,
    gameDate: row.game_date,
    opponent: row.opponent ?? null,
    durationMin: row.duration_min === null || row.duration_min === undefined ? null : Number(row.duration_min),
  }));
}

export function fetchSeasonMoments(supabase: SupabaseClient, season: string): Promise<LeagueMoment[]> {
  return fetchMoments(supabase, season);
}

/** One week's minted moments — the pool a pack bought for that week can
 *  draw from. Empty is the normal case: most weeks mint none that anyone
 *  opens a pack for. */
export async function fetchWeekMoments(
  supabase: SupabaseClient,
  season: string,
  weekStart: string,
): Promise<LeagueMoment[]> {
  return fetchMoments(supabase, season, weekStart);
}
