import { createServerSupabase } from "@/lib/supabase/server";
import type { Draft, Player, Profile, Team } from "@/lib/draft/types";
import { toRosterTeams } from "@/lib/teams/roster";
import AdminTeamEditor from "@/components/teams/AdminTeamEditor";
import AdminRosterEditor from "@/components/teams/AdminRosterEditor";
import FeaturedDraftSelector from "@/components/teams/FeaturedDraftSelector";
import { PLACEHOLDER_TEAMS } from "@/components/teams/placeholderTeams";
import TeamsDirectory from "@/components/teams/TeamsDirectory";

export default async function TeamsPage() {
  const supabase = await createServerSupabase();
  const { data: userData } = await supabase.auth.getUser();
  let isAdmin = false;

  if (userData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  const [settingsResult, draftsResult] = await Promise.all([
    supabase
      .from("league_settings")
      .select("featured_draft_id")
      .eq("id", 1)
      .single(),
    isAdmin
      ? supabase.from("drafts").select("id, name").order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
  ]);

  const featuredDraftId = settingsResult.data?.featured_draft_id ?? null;
  let selectedDraft: Draft | null = null;
  let selectedTeams: Team[] = [];
  let selectedPlayers: Player[] = [];
  let profiles: Profile[] = [];

  if (featuredDraftId) {
    const [draftResult, teamsResult, playersResult] = await Promise.all([
      supabase.from("drafts").select("*").eq("id", featuredDraftId).single(),
      supabase
        .from("teams")
        .select("*")
        .eq("draft_id", featuredDraftId)
        .order("nomination_position"),
      supabase
        .from("players")
        .select("*")
        .eq("draft_id", featuredDraftId)
        .order("display_name"),
    ]);
    selectedDraft = (draftResult.data as Draft) ?? null;
    selectedTeams = (teamsResult.data as Team[]) ?? [];
    selectedPlayers = (playersResult.data as Player[]) ?? [];

    const { data: profileRows } = await supabase
      .from("profiles")
      .select("id, display_name")
      .order("display_name");
    profiles = (profileRows as Profile[]) ?? [];
  }

  const hasSelectedDraft = Boolean(selectedDraft);
  const teams = hasSelectedDraft
    ? toRosterTeams(selectedTeams, selectedPlayers, profiles)
    : PLACEHOLDER_TEAMS;

  return (
    <TeamsDirectory
      draftName={selectedDraft?.name ?? null}
      isPreview={!hasSelectedDraft}
      teams={teams}
      adminControls={
        isAdmin ? (
          <FeaturedDraftSelector
            drafts={(draftsResult.data as { id: string; name: string }[]) ?? []}
            selectedDraftId={selectedDraft?.id ?? null}
          />
        ) : null
      }
      rosterContent={
        hasSelectedDraft && isAdmin ? (
          <AdminTeamEditor
            key={selectedDraft!.id}
            draftId={selectedDraft!.id}
            teams={selectedTeams}
            profiles={profiles}
          >
            <AdminRosterEditor
              draftId={selectedDraft!.id}
              teams={selectedTeams}
              players={selectedPlayers}
              profiles={profiles}
            />
          </AdminTeamEditor>
        ) : undefined
      }
    />
  );
}
