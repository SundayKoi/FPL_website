import type { SupabaseClient } from "@supabase/supabase-js";
import type { Draft, Player, Profile, Team } from "@/lib/draft/types";

export type AcademyDraftData = {
  draft: Draft | null;
  teams: Team[];
  players: Player[];
  profiles: Profile[];
};

export async function fetchAcademyDraftData(supabase: SupabaseClient): Promise<AcademyDraftData> {
  const [{ data: settings }, { data: fallback }] = await Promise.all([
    supabase.from("league_settings").select("academy_draft_id").eq("id", 1).single(),
    supabase.from("drafts").select("id, name").eq("name", "S1 Academy").maybeSingle(),
  ]);
  const draftId = (settings as { academy_draft_id?: string | null } | null)?.academy_draft_id ??
    (fallback as { id?: string } | null)?.id ?? null;
  if (!draftId) return { draft: null, teams: [], players: [], profiles: [] };

  const [draftResult, teamsResult, playersResult, profilesResult] = await Promise.all([
    supabase.from("drafts").select("*").eq("id", draftId).maybeSingle(),
    supabase.from("teams").select("*").eq("draft_id", draftId).order("nomination_position"),
    supabase.from("players").select("*").eq("draft_id", draftId).order("display_name"),
    supabase.from("profiles").select("id, display_name").order("display_name"),
  ]);
  return {
    draft: (draftResult.data as Draft | null) ?? null,
    teams: (teamsResult.data as Team[]) ?? [],
    players: (playersResult.data as Player[]) ?? [],
    profiles: (profilesResult.data as Profile[]) ?? [],
  };
}
