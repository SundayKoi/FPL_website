import { createServerSupabase } from "@/lib/supabase/server";

export interface HomeStandingTeam {
  id: string;
  name: string;
  abbreviation: string;
  nomination_position: number;
  wins: number;
  losses: number;
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
