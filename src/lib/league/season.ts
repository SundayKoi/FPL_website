import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueView } from "./context";

/**
 * The two leagues run on separate season codes: Premier is on its own
 * numbering (S5 at time of writing) while Academy started fresh at A1, so
 * Premier's S1-S4 history never appears in an Academy-scoped query. Both live
 * on league_settings id=1 and are admin-set from the schedule page.
 */
export interface LeagueSeasons {
  premier: string;
  academy: string;
}

type SettingsRow = { current_season?: string | null; academy_season?: string | null };

export const DEFAULT_ACADEMY_SEASON = "A1";

export function seasonForLeague(seasons: LeagueSeasons, league: LeagueView): string {
  return league === "academy" ? seasons.academy : seasons.premier;
}

export async function fetchLeagueSeasons(supabase: SupabaseClient): Promise<LeagueSeasons> {
  const { data } = await supabase
    .from("league_settings")
    .select("current_season, academy_season")
    .eq("id", 1)
    .single();
  const row = (data as SettingsRow | null) ?? null;
  return {
    premier: row?.current_season ?? "",
    academy: row?.academy_season ?? DEFAULT_ACADEMY_SEASON,
  };
}
