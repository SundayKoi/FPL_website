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
import type {
  ChampionAggRow,
  GameLogRow,
  PlayerAggRow,
  RecordRow,
  TeamAggRow,
} from "./types";

export async function fetchPlayerAgg(season?: string, phase?: string): Promise<PlayerAggRow[]> {
  const supabase = createClient();
  let query = supabase.from("stats_player_agg").select("*");
  if (season) query = query.eq("season", season);
  if (phase && phase !== "All") query = query.eq("season_phase", phase);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as PlayerAggRow[];
}

export async function fetchTeamAgg(season?: string, phase?: string): Promise<TeamAggRow[]> {
  const supabase = createClient();
  let query = supabase.from("stats_team_agg").select("*");
  if (season) query = query.eq("season", season);
  if (phase && phase !== "All") query = query.eq("season_phase", phase);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as TeamAggRow[];
}

export async function fetchChampionAgg(season?: string, phase?: string): Promise<ChampionAggRow[]> {
  const supabase = createClient();
  let query = supabase.from("stats_champion_agg").select("*");
  if (season) query = query.eq("season", season);
  if (phase && phase !== "All") query = query.eq("season_phase", phase);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as ChampionAggRow[];
}

export async function fetchRecords(season?: string, phase?: string): Promise<RecordRow[]> {
  const supabase = createClient();
  let query = supabase.from("stats_records").select("*");
  if (season) query = query.eq("season", season);
  if (phase && phase !== "All") query = query.eq("season_phase", phase);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as RecordRow[];
}

export async function fetchGameLog(season?: string, phase?: string): Promise<GameLogRow[]> {
  const supabase = createClient();
  let query = supabase.from("stats_game_log").select("*");
  if (season) query = query.eq("season", season);
  if (phase && phase !== "All") query = query.eq("season_phase", phase);
  const { data, error } = await query;
  if (error) throw error;
  return (data ?? []) as GameLogRow[];
}

/**
 * Distinct seasons present in `stats_game_log`, newest first (assumes
 * season codes sort lexicographically newest-last, e.g. S1 < S2 < S3 < S4 —
 * matches the seasons seen in local data). Used by `SeasonSelect` to build
 * its option list and default to the newest season.
 */
export async function fetchSeasons(): Promise<string[]> {
  const supabase = createClient();
  const { data, error } = await supabase.from("stats_game_log").select("season");
  if (error) throw error;
  const unique = Array.from(new Set((data ?? []).map((row) => row.season as string)));
  return unique.sort().reverse();
}
