import PlayersDirectory from "@/components/players/PlayersDirectory";
import type { PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import { FREE_AGENCY_PLAYER_SUMMARIES } from "@/lib/players/freeAgencyData";
import { adaptCanonicalPlayerPool } from "@/lib/players/freeAgency";
import { primaryLinkedAccountUrl } from "@/lib/players/linkedAccounts";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";

export default async function PlayersPage() {
  const supabase = await createServerSupabase();
  const [
    { isAdmin, isOwner },
    { data: bids },
    { data: canonicalPlayers, error: canonicalPlayersError },
  ] = await Promise.all([
    fetchStaffTier(supabase),
    supabase.from("free_agency_avg_bids").select("player_name, avg_bid"),
    supabase
      .from("player_pool")
      .select("id, season_key, display_name, role, rank, opgg_url")
      .eq("season_key", "season-5"),
  ]);

  const initialAvgBids = Object.fromEntries(
    (bids ?? []).map((bid) => [bid.player_name, bid.avg_bid]),
  );
  // Rows without a stored op.gg link fall back to the league's linked
  // accounts sheet, so player names in the directory link somewhere useful.
  // ?? alone misses empty-string rows, which the pool does contain.
  const linkedPlayers = (canonicalPlayers ?? []).map((player) => ({
    ...player,
    opgg_url: player.opgg_url?.trim() ? player.opgg_url : primaryLinkedAccountUrl(player.display_name),
  }));
  const seasons = adaptCanonicalPlayerPool(linkedPlayers);
  const canonicalAdminRows = (canonicalPlayers ?? []).map((player) => ({
    id: player.id,
    season_key: player.season_key,
    display_name: player.display_name,
    role: player.role,
    rank: player.rank,
    opgg_url: player.opgg_url,
  }));
  const emptyStateMessages = {
    "season-4": "Season 4 player data has not been added yet.",
    ...(canonicalPlayersError || seasons["season-5"].every((section) => section.players.length === 0)
      ? { "season-5": "Player List data is unavailable for Season 5 right now." }
      : {}),
  };

  return (
    <PlayersDirectory
      seasons={seasons}
      canonicalPlayers={canonicalAdminRows as PlayerPoolRow[]}
      isAdmin={isAdmin}
      isOwner={isOwner}
      initialAvgBids={initialAvgBids}
      freeAgencyPlayers={FREE_AGENCY_PLAYER_SUMMARIES}
      emptyStateMessages={emptyStateMessages}
      pageView="premier"
    />
  );
}
