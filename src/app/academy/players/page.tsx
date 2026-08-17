import AcademyPlayersDirectory from "@/components/academy/AcademyPlayersDirectory";
import type { PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { fetchAcademyPlayers, mergeAcademyPlayers } from "@/lib/academy/playerSheet";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function AcademyPlayersPage() {
  const supabase = await createServerSupabase();
  const [
    { data: userData },
    draftData,
    sheetPlayers,
    { data: canonicalPlayers },
  ] = await Promise.all([
    supabase.auth.getUser(),
    fetchAcademyDraftData(supabase),
    fetchAcademyPlayers(),
    supabase
      .from("player_pool")
      .select("id, season_key, display_name, role, rank, opgg_url")
      .eq("season_key", "academy-1"),
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
    />
  );
}
