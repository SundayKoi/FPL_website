import { createServerSupabase } from "@/lib/supabase/server";
import { bundledSeason4Rows, deriveStandings, fetchSeason4RawStats } from "./awards";

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

export async function fetchHomepageStandings(): Promise<HomeStandingTeam[]> {
  const supabase = await createServerSupabase();
  const { data: settings, error: settingsError } = await supabase
    .from("league_settings")
    .select("featured_draft_id")
    .eq("id", 1)
    .single();

  if (settingsError && settingsError.code !== "PGRST116") throw settingsError;

  const featuredDraftId = (settings as { featured_draft_id?: string | null } | null)?.featured_draft_id;
  if (!featuredDraftId) return [];

  try {
    const season4Rows = await fetchSeason4RawStats();
    if (season4Rows.length > 0) {
      return deriveStandings(season4Rows);
    }
  } catch {
    // Use the checked-in Season 4 snapshot when the live historical table is
    // unavailable, then fall back to the current draft only as a last resort.
  }

  const bundledRows = bundledSeason4Rows();
  if (bundledRows.length > 0) {
    return deriveStandings(bundledRows);
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
