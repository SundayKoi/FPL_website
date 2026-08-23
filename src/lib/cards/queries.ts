// Data layer for player cards. Fetches one season's stats (public tables/
// views only — share pages render for signed-out visitors) and runs every
// player through the rating engine. Cards are computed at request time, so
// they update themselves the moment the nightly ingest lands new games.

import type { SupabaseClient } from "@supabase/supabase-js";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import type { GameLogRow, PlayerAggRow } from "@/lib/stats/types";
import { buildSeasonCards, type CardGameRow, type PlayerCardData } from "./build";

/** The season the cards page rates — the site's current one. */
export async function fetchCardSeason(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("league_settings").select("current_season").eq("id", 1).maybeSingle();
  return (data as { current_season: string | null } | null)?.current_season ?? null;
}

/**
 * Every player's card for `season`, best overall first. One fetch pass for
 * the whole league: the rating engine needs the full cohort anyway (all
 * ratings are league-relative), so per-player fetching would save nothing.
 */
export async function fetchSeasonCards(supabase: SupabaseClient, season: string): Promise<PlayerCardData[]> {
  const [aggResult, gamesResult, logResult] = await Promise.all([
    supabase.from("stats_player_agg").select("*").eq("season", season),
    supabase
      .from("raw_stats")
      .select("summoner_name, tag, champion, win, game_date, match_id, team_name")
      .eq("season", season),
    supabase.from("stats_game_log").select("match_id, duration_min").eq("season", season),
  ]);
  if (aggResult.error) throw aggResult.error;
  if (gamesResult.error) throw gamesResult.error;
  if (logResult.error) throw logResult.error;

  // The view emits one row per (season, phase) — merge Regular+Playoffs
  // into a single season row per player, same as the stats tabs do.
  const cohort = mergeRows(
    (aggResult.data as PlayerAggRow[]) ?? [],
    (row) => `${row.summoner_name.trim().toLowerCase()}#${row.tag.trim().toLowerCase()}`,
    (group) => combineSeasonRows(group, season),
  );

  const gamesByPlayer = new Map<string, CardGameRow[]>();
  for (const game of (gamesResult.data as CardGameRow[]) ?? []) {
    const key = `${game.summoner_name.trim().toLowerCase()}#${game.tag.trim().toLowerCase()}`;
    const list = gamesByPlayer.get(key) ?? [];
    list.push(game);
    gamesByPlayer.set(key, list);
  }

  const durations = new Map<string, number>();
  for (const log of (logResult.data as Pick<GameLogRow, "match_id" | "duration_min">[]) ?? []) {
    durations.set(log.match_id, log.duration_min);
  }

  // buildSeasonCards (not per-player buildCard): archetypes are assigned
  // league-wide with per-title caps, so titles stay scarce and distinctive.
  return buildSeasonCards({ cohort, gamesByPlayer, durations });
}

/** One card by its URL slug, or null. */
export async function fetchCardBySlug(
  supabase: SupabaseClient,
  season: string,
  slug: string,
): Promise<PlayerCardData | null> {
  const cards = await fetchSeasonCards(supabase, season);
  return cards.find((card) => card.slug === slug) ?? null;
}
