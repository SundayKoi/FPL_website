import AcademyPlayersDirectory from "@/components/academy/AcademyPlayersDirectory";
import type { PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchAcademyPlayers, mergeAcademyPlayers } from "@/lib/academy/playerSheet";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchLeagueSeasons } from "@/lib/league/season";
import type {
  PlayerIdentityLinkRow,
  VerifiedProfileOption,
} from "@/components/players/PlayerIdentityAdmin";

export default async function AcademyPlayersPage() {
  const supabase = await createServerSupabase();
  const [
    { data: userData },
    draftData,
    sheetPlayers,
    { data: canonicalPlayers },
    leagueSeasons,
  ] = await Promise.all([
    supabase.auth.getUser(),
    fetchAcademyDraftData(supabase),
    fetchAcademyPlayers(),
    supabase
      .from("player_pool")
      .select("id, season_key, display_name, role, rank, opgg_url")
      .eq("season_key", "academy-1"),
    fetchLeagueSeasons(supabase),
  ]);

  let isAdmin = false;
  if (userData.user) {
    const { data: profile } = await supabase
      .from("profiles")
      .select("is_admin")
      .eq("id", userData.user.id)
      .single();
    isAdmin = profile?.is_admin ?? false;
  }

  const [profileResult, identityResult] = isAdmin && leagueSeasons.academy
    ? await Promise.all([
        supabase.from("profiles").select("id, display_name, discord_id"),
        supabase
          .from("player_identity_links")
          .select("id, player_pool_id, profile_id, status")
          .eq("league", "academy")
          .eq("season", leagueSeasons.academy),
      ])
    : [{ data: [] }, { data: [] }];
  const identityProfiles: VerifiedProfileOption[] = (profileResult.data ?? [])
    .map((profile) => ({
      id: profile.id,
      displayName: profile.display_name,
      discordId: profile.discord_id,
    }))
    .sort((left, right) => left.displayName.localeCompare(right.displayName));
  const identityLinks: PlayerIdentityLinkRow[] = (identityResult.data ?? []).map((link) => ({
    id: link.id,
    playerPoolId: link.player_pool_id,
    profileId: link.profile_id,
    status: link.status,
  }));

  const players = draftData.draft ? mergeAcademyPlayers(draftData.players, sheetPlayers) : [];
  const canonicalAdminRows: PlayerPoolRow[] = (canonicalPlayers ?? []).map((player) => ({
    id: player.id,
    season_key: player.season_key,
    display_name: player.display_name,
    role: player.role,
    rank: player.rank,
    opgg_url: player.opgg_url,
  }));

  return (
    <AcademyPlayersDirectory
      players={players}
      canonicalPlayers={canonicalAdminRows}
      isAdmin={isAdmin}
      poolSeasonKey="academy-1"
      identitySeason={isAdmin ? leagueSeasons.academy : undefined}
      identityLinks={isAdmin ? identityLinks : undefined}
      identityProfiles={isAdmin ? identityProfiles : undefined}
    />
  );
}
