import { createServerSupabase } from "@/lib/supabase/server";
import { PREMIER_SEASON, deriveStandings, fetchHomepageRawStats } from "./awards";

export interface HomeStandingTeam {
  id: string;
  name: string;
  abbreviation: string;
  nomination_position: number;
  wins: number;
  losses: number;
  winrate_pct?: number;
}

type TeamRow = Pick<HomeStandingTeam, "id" | "name" | "abbreviation" | "nomination_position">;

/**
 * Standings for one league's homepage. Premier reads the featured draft and
 * its own season; Academy passes its draft column, season code and team names
 * so the two never mix (they share raw_stats and the teams table).
 */
export async function fetchHomepageStandings(
  season: string = PREMIER_SEASON,
  teamNames?: string[],
  draftColumn: "featured_draft_id" | "academy_draft_id" = "featured_draft_id",
): Promise<HomeStandingTeam[]> {
  const supabase = await createServerSupabase();
  const { data: settings, error: settingsError } = await supabase
    .from("league_settings")
    .select(draftColumn)
    .eq("id", 1)
    .single();

  if (settingsError && settingsError.code !== "PGRST116") throw settingsError;

  const featuredDraftId = (settings as Record<string, string | null> | null)?.[draftColumn];
  if (!featuredDraftId) return [];

  try {
    const seasonRows = await fetchHomepageRawStats(season, teamNames);
    const standings = deriveStandings(seasonRows, season);
    if (standings.length > 0) {
      return standings;
    }
  } catch {
    // Fall back to configured current-season teams when live stats are unavailable.
  }

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, abbreviation, nomination_position")
    .eq("draft_id", featuredDraftId)
    .order("nomination_position", { ascending: true });

  if (teamsError) throw teamsError;

  return ((teams ?? []) as TeamRow[]).map((team) => ({
    ...team,
    wins: 0,
    losses: 0,
  }));
}
