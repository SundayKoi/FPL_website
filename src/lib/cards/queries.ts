// Data layer for player cards. Fetches one season's stats (public tables/
// views only — share pages render for signed-out visitors) and runs every
// player through the rating engine. Cards are computed at request time, so
// they update themselves the moment the nightly ingest lands new games.
//
// Deliberately framework-free (takes any SupabaseClient, no next/headers):
// scripts/weekly-card-drop.ts runs this same code under tsx with a service
// client. The one Next-coupled input — the Weekly Standout, whose pipeline
// lives in src/lib/home/awards.ts — is passed IN via options; pages resolve
// it with fetchStandoutKey (src/lib/cards/standout.ts).

import type { SupabaseClient } from "@supabase/supabase-js";
import { combineSeasonRows, mergeRows } from "@/lib/stats/formulas";
import type { GameLogRow, PlayerAggRow, RecordRow } from "@/lib/stats/types";
import {
  buildSeasonCards,
  cardPlayerKey,
  type CardGameMeta,
  type CardGameRow,
  type PlayerCardData,
} from "./build";

/** The season the cards page rates — the site's current one. */
export async function fetchCardSeason(supabase: SupabaseClient): Promise<string | null> {
  const { data } = await supabase.from("league_settings").select("current_season").eq("id", 1).maybeSingle();
  return (data as { current_season: string | null } | null)?.current_season ?? null;
}

export interface FetchSeasonCardsOptions {
  /** Per-role Weekly Standout player keys (cardPlayerKey) — flags each
   *  role's Card of the Week. */
  standoutKeys?: Set<string> | null;
}

/**
 * Every player's card for `season`, best overall first. One fetch pass for
 * the whole league: the rating engine needs the full cohort anyway (all
 * ratings are league-relative), so per-player fetching would save nothing.
 */
export async function fetchSeasonCards(
  supabase: SupabaseClient,
  season: string,
  options: FetchSeasonCardsOptions = {},
): Promise<PlayerCardData[]> {
  const [aggResult, gamesResult, logResult, recordsResult, teamsResult, artResult] = await Promise.all([
    supabase.from("stats_player_agg").select("*").eq("season", season),
    supabase
      .from("raw_stats")
      .select("summoner_name, tag, champion, win, game_date, match_id, team_name, kills, deaths, assists, cs, total_damage_to_champions")
      .eq("season", season),
    supabase.from("stats_game_log").select("match_id, duration_min, blue_team, red_team").eq("season", season),
    supabase.from("stats_records").select("category, summoner_name, tag").eq("season", season),
    supabase.from("teams").select("name, image_url"),
    // select * on purpose: the motto column arrived in a later migration
    // than skin, and naming a missing column would fail the whole select.
    supabase.from("card_art_prefs").select("*").eq("season", season),
  ]);
  if (aggResult.error) throw aggResult.error;
  if (gamesResult.error) throw gamesResult.error;
  if (logResult.error) throw logResult.error;
  // Records / team art / skin prefs are garnish — a failure (e.g. the
  // card_art_prefs migration not applied yet) must not take cards down.
  const recordRows = recordsResult.error ? [] : ((recordsResult.data as Pick<RecordRow, "category" | "summoner_name" | "tag">[]) ?? []);
  const teamRows = teamsResult.error ? [] : ((teamsResult.data as { name: string; image_url: string | null }[]) ?? []);
  const artRows = artResult.error
    ? []
    : ((artResult.data as { summoner_name: string; tag: string; skin: number; motto?: string | null }[]) ?? []);

  // The view emits one row per (season, phase) — merge Regular+Playoffs
  // into a single season row per player, same as the stats tabs do.
  const cohort = mergeRows(
    (aggResult.data as PlayerAggRow[]) ?? [],
    (row) => cardPlayerKey(row.summoner_name, row.tag),
    (group) => combineSeasonRows(group, season),
  );

  const gamesByPlayer = new Map<string, CardGameRow[]>();
  for (const game of (gamesResult.data as CardGameRow[]) ?? []) {
    const key = cardPlayerKey(game.summoner_name, game.tag);
    const list = gamesByPlayer.get(key) ?? [];
    list.push(game);
    gamesByPlayer.set(key, list);
  }

  const gameLog = new Map<string, CardGameMeta>();
  for (const log of (logResult.data as Pick<GameLogRow, "match_id" | "duration_min" | "blue_team" | "red_team">[]) ?? []) {
    gameLog.set(log.match_id, { durationMin: log.duration_min, blueTeam: log.blue_team, redTeam: log.red_team });
  }

  const recordsByPlayer = new Map<string, string[]>();
  for (const record of recordRows) {
    const key = cardPlayerKey(record.summoner_name, record.tag);
    const list = recordsByPlayer.get(key) ?? [];
    if (!list.includes(record.category)) list.push(record.category);
    recordsByPlayer.set(key, list);
  }

  const teamImages = new Map<string, string>();
  for (const team of teamRows) {
    if (team.image_url && !teamImages.has(team.name.trim().toLowerCase())) {
      teamImages.set(team.name.trim().toLowerCase(), team.image_url);
    }
  }

  const artPrefs = new Map<string, { skin: number; motto: string | null }>();
  for (const art of artRows) {
    artPrefs.set(cardPlayerKey(art.summoner_name, art.tag), { skin: art.skin, motto: art.motto ?? null });
  }

  return buildSeasonCards({
    cohort,
    gamesByPlayer,
    gameLog,
    recordsByPlayer,
    teamImages,
    artPrefs,
    standoutKeys: options.standoutKeys ?? null,
  });
}

export interface RatingHistoryPoint {
  overall: number;
  tier: string;
  takenAt: string;
}

/** One card's weekly rating readings, oldest first — the season journey.
 *  Errors (e.g. the history migration not applied yet) return empty: the
 *  journey strip is garnish. */
export async function fetchRatingHistory(
  supabase: SupabaseClient,
  season: string,
  slug: string,
): Promise<RatingHistoryPoint[]> {
  const { data, error } = await supabase
    .from("card_rating_history")
    .select("overall, tier, taken_at")
    .eq("season", season)
    .eq("slug", slug)
    .order("taken_at");
  if (error) return [];
  return ((data as { overall: number; tier: string; taken_at: string }[]) ?? []).map((row) => ({
    overall: row.overall,
    tier: row.tier,
    takenAt: row.taken_at,
  }));
}

/** One card by its URL slug, or null. */
export async function fetchCardBySlug(
  supabase: SupabaseClient,
  season: string,
  slug: string,
  options: FetchSeasonCardsOptions = {},
): Promise<PlayerCardData | null> {
  const cards = await fetchSeasonCards(supabase, season, options);
  return cards.find((card) => card.slug === slug) ?? null;
}
