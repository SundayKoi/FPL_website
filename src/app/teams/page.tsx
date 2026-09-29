import type { Metadata } from "next";
import Link from "next/link";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import type { Draft, Player, Profile, Team } from "@/lib/draft/types";
import { toRosterTeams } from "@/lib/teams/roster";
import { PLACEHOLDER_TEAMS } from "@/components/teams/placeholderTeams";
import TeamsDirectory from "@/components/teams/TeamsDirectory";

export const metadata: Metadata = {
  title: "Teams — FPL",
};

type TeamsPageProps = {
  searchParams: Promise<{ view?: string | string[] }>;
};

export default async function TeamsPage({ searchParams }: TeamsPageProps) {
  const view = (await searchParams)?.view;
  const isAcademy = view === "academy";
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);

  const [settingsResult, academyDraftResult] = await Promise.all([
    supabase
      .from("league_settings")
      .select("featured_draft_id, academy_draft_id")
      .eq("id", 1)
      .single(),
    supabase.from("drafts").select("id, name").eq("name", "S1 Academy").maybeSingle(),
  ]);

  const featuredDraftId = settingsResult.data?.featured_draft_id ?? null;
  const fallbackAcademyDraft = (academyDraftResult.data as { id: string; name: string } | null) ?? null;
  const academyDraftId = settingsResult.data?.academy_draft_id ?? fallbackAcademyDraft?.id ?? null;
  const selectedDraftId = isAcademy ? academyDraftId : featuredDraftId;
  let selectedDraft: Draft | null = null;
  let selectedTeams: Team[] = [];
  let selectedPlayers: Player[] = [];
  let profiles: Profile[] = [];

  if (selectedDraftId) {
    const [draftResult, teamsResult, playersResult] = await Promise.all([
      supabase.from("drafts").select("*").eq("id", selectedDraftId).single(),
      supabase
        .from("teams")
        .select("*")
        .eq("draft_id", selectedDraftId)
        .order("nomination_position"),
      supabase
        .from("players")
        .select("*")
        .eq("draft_id", selectedDraftId)
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

  const teams = selectedDraft
    ? toRosterTeams(selectedTeams, selectedPlayers, profiles)
    : PLACEHOLDER_TEAMS;

  return (
    <>
      {isAdmin || isOwner ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-8">
          <Link href={`/admin/league/teams?league=${isAcademy ? "academy" : "premier"}`} className="text-sm font-semibold text-action-text underline underline-offset-4">
            Manage teams and rosters in Admin →
          </Link>
        </div>
      ) : null}
      <TeamsDirectory draftName={selectedDraft?.name ?? null} isPreview={!selectedDraft} league={isAcademy ? "academy" : "premier"} teams={teams} />
    </>
  );
}
