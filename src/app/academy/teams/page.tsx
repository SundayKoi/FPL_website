import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { toRosterTeams } from "@/lib/teams/roster";
import { PLACEHOLDER_TEAMS } from "@/components/teams/placeholderTeams";
import TeamsDirectory from "@/components/teams/TeamsDirectory";
import { academyOpggUrlForPlayer } from "@/lib/academy/playerSheet";
import { fetchLeagueSeasons } from "@/lib/league/season";
import { draftRosterClaimEntries, loadRosterClaimTargets } from "@/lib/teams/rosterClaims";
import { teamSlug } from "@/lib/teams/teamPage";

export const metadata: Metadata = {
  title: "Teams — FPL Academy",
};

export default async function AcademyTeamsPage() {
  const supabase = await createServerSupabase();
  const [data, leagueSeasons, viewerResult, leagueTeamsResult] = await Promise.all([
    fetchAcademyDraftData(supabase),
    fetchLeagueSeasons(supabase),
    supabase.auth.getUser().then((result) => result, () => ({ data: { user: null } })),
    supabase.from("league_teams").select("id, name").eq("active", true),
  ]);
  const hasDraft = Boolean(data.draft);
  const claimEntries = draftRosterClaimEntries(
    data.players,
    data.teams,
    (leagueTeamsResult.data as { id: string; name: string }[] | null) ?? [],
    (teamName) => `/academy/teams/${teamSlug(teamName)}`,
  );
  const playerClaims = await loadRosterClaimTargets(
    supabase,
    claimEntries,
    "academy",
    leagueSeasons.academy,
    viewerResult.data.user?.id ?? null,
  );
  return (
    <TeamsDirectory
      draftName={data.draft?.name ?? "S1 Academy"}
      isPreview={!hasDraft}
      league="academy"
      teams={hasDraft
        ? toRosterTeams(
            data.teams,
            data.players.map((player) => ({
              ...player,
              opgg_url: player.opgg_url ?? academyOpggUrlForPlayer(player.display_name),
            })),
            data.profiles,
          )
        : PLACEHOLDER_TEAMS}
      playerClaims={playerClaims}
    />
  );
}
