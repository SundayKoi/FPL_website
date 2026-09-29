import { redirect } from "next/navigation";
import AdminSectionContext from "@/components/admin/AdminSectionContext";
import AdminSectionHeader from "@/components/admin/AdminSectionHeader";
import AdminRosterEditor from "@/components/teams/AdminRosterEditor";
import AdminTeamEditor from "@/components/teams/AdminTeamEditor";
import FeaturedDraftSelector from "@/components/teams/FeaturedDraftSelector";
import { PLACEHOLDER_TEAMS } from "@/components/teams/placeholderTeams";
import TeamsDirectory from "@/components/teams/TeamsDirectory";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLeagueSeasons } from "@/lib/league/season";
import type { Draft, Player, Profile, Team } from "@/lib/draft/types";
import { toRosterTeams } from "@/lib/teams/roster";

export const metadata = { title: "Teams & rosters — FPL Admin" };

export default async function AdminTeamsPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  if (!isAdmin && !isOwner) redirect("/admin");
  const params = await searchParams;
  const leagueValue = Array.isArray(params.league) ? params.league[0] : params.league;
  const league = leagueValue === "academy" ? "academy" : "premier";

  const [settingsResult, academyDraftResult, draftsResult, leagueSeasons] = await Promise.all([
    supabase.from("league_settings").select("featured_draft_id, academy_draft_id").eq("id", 1).single(),
    supabase.from("drafts").select("id, name").eq("name", "S1 Academy").maybeSingle(),
    isAdmin || isOwner ? supabase.from("drafts").select("id, name").order("created_at", { ascending: false }) : Promise.resolve({ data: [] }),
    fetchLeagueSeasons(supabase),
  ]);
  const featuredDraftId = settingsResult.data?.featured_draft_id ?? null;
  const academyDraft = academyDraftResult.data as { id: string; name: string } | null;
  const academyDraftId = settingsResult.data?.academy_draft_id ?? academyDraft?.id ?? null;
  const selectedDraftId = league === "academy" ? academyDraftId : featuredDraftId;
  let selectedDraft: Draft | null = null;
  let teams: Team[] = [];
  let players: Player[] = [];
  let profiles: Profile[] = [];

  if (selectedDraftId) {
    const [draftResult, teamsResult, playersResult, profilesResult] = await Promise.all([
      supabase.from("drafts").select("*").eq("id", selectedDraftId).single(),
      supabase.from("teams").select("*").eq("draft_id", selectedDraftId).order("nomination_position"),
      supabase.from("players").select("*").eq("draft_id", selectedDraftId).order("display_name"),
      supabase.from("profiles").select("id, display_name").order("display_name"),
    ]);
    selectedDraft = (draftResult.data as Draft | null) ?? null;
    teams = (teamsResult.data as Team[] | null) ?? [];
    players = (playersResult.data as Player[] | null) ?? [];
    profiles = (profilesResult.data as Profile[] | null) ?? [];
  }

  const hasSelectedDraft = Boolean(selectedDraft);
  return (
    <main className="page-backdrop mx-auto flex w-full max-w-6xl flex-1 flex-col gap-6 px-4 py-8 text-content sm:px-6 lg:px-8">
      <AdminSectionHeader title="Teams & rosters" description="Choose the league roster set, edit team identity, and review the current draft roster. Draft selection is a global league setting.">
        <AdminSectionContext
          league={league}
          defaultSeasons={{ premier: leagueSeasons.premier || "S5", academy: leagueSeasons.academy || "A1" }}
          leagueOnly
        />
      </AdminSectionHeader>
      {settingsResult.error ? <p role="alert" className="card-brand p-4 text-sm text-red-300">Team settings are unavailable.</p> : null}
      <TeamsDirectory
        draftName={selectedDraft?.name ?? null}
        isPreview={!hasSelectedDraft}
        league={league}
        teams={hasSelectedDraft ? toRosterTeams(teams, players, profiles) : PLACEHOLDER_TEAMS}
        adminControls={isOwner ? (
          <FeaturedDraftSelector
            drafts={(draftsResult.data as { id: string; name: string }[] | null) ?? []}
            premierDraftId={featuredDraftId}
            academyDraftId={academyDraftId}
          />
        ) : null}
        rosterContent={hasSelectedDraft && isAdmin ? (
          <AdminTeamEditor key={selectedDraft!.id} draftId={selectedDraft!.id} teams={teams} profiles={profiles}>
            <AdminRosterEditor draftId={selectedDraft!.id} teams={teams} players={players} profiles={profiles} />
          </AdminTeamEditor>
        ) : undefined}
      />
    </main>
  );
}
