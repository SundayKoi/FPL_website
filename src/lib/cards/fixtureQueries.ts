// The season's fixtures as the send-off reads them. Split out of queries.ts,
// which re-exports it, so the edition queries can read fixtures without
// importing the queries barrel.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { SendoffFixture } from "./sendoff";

/**
 * The season's playoff-relevant fixture rows — everything sendoff.ts reads.
 *
 * Both leagues' fixtures carry the same season code as their cards, so this
 * is league-agnostic like the rest of the pipeline. Returns [] on error: for
 * every reader but the edition builder a fixture is garnish (it decides
 * which rating basis a live surface shows, and the season build is the safe
 * answer), and the builder checks the read separately before it prints an
 * edition off it.
 */
export async function fetchSeasonFixtures(supabase: SupabaseClient, season: string): Promise<SendoffFixture[]> {
  const { data, error } = await supabase
    .from("fixtures")
    .select("stage, team_a, team_b, score_a, score_b, scheduled_at")
    .eq("season", season);
  if (error) return [];
  return ((data as SendoffFixture[]) ?? []);
}
