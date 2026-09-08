import type { Metadata } from "next";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { toRosterTeams } from "@/lib/teams/roster";
import { PLACEHOLDER_TEAMS } from "@/components/teams/placeholderTeams";
import TeamsDirectory from "@/components/teams/TeamsDirectory";
import { academyOpggUrlForPlayer } from "@/lib/academy/playerSheet";
import { fetchLeagueSeasons } from "@/lib/league/season";
import { buildRosterClaimTargets, fetchRosterClaimTargets, type RosterClaimTarget } from "@/lib/teams/rosterClaims";
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
  const activeTeamByName = new Map(
    (((leagueTeamsResult.data as { id: string; name: string }[] | null) ?? [])).map((team) => [
      team.name.trim().toLowerCase(),
      team.id,
    ]),
  );
  const claimEntries = [
    ...new Map(
      data.players.flatMap((player) => {
        if (!player.canonical_player_id || !player.team_id) return [];
        const draftTeam = data.teams.find((team) => team.id === player.team_id);
        if (!draftTeam) return [];
        const leagueTeamId = activeTeamByName.get(draftTeam.name.trim().toLowerCase());
        if (!leagueTeamId) return [];
        return [[
          player.canonical_player_id,
          {
            playerPoolId: player.canonical_player_id,
            leagueTeamId,
            returnPath: `/academy/teams/${teamSlug(draftTeam.name)}`,
          },
        ] as const];
      }),
    ).values(),
  ];
  let playerClaims: Record<string, RosterClaimTarget> = {};
  if (claimEntries.length && leagueSeasons.academy) {
    try {
      playerClaims = await fetchRosterClaimTargets(
        supabase,
        claimEntries,
        "academy",
        leagueSeasons.academy,
        viewerResult.data.user?.id ?? null,
      );
    } catch {
      playerClaims = buildRosterClaimTargets(
        claimEntries,
        {},
        "academy",
        leagueSeasons.academy,
        viewerResult.data.user?.id != null,
        true,
      );
    }
  }
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
