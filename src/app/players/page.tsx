import PlayersDirectory from "@/components/players/PlayersDirectory";
import { FREE_AGENCY_PLAYER_SUMMARIES } from "@/lib/players/freeAgencyData";
import { adaptCanonicalPlayerPool } from "@/lib/players/freeAgency";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function PlayersPage() {
  const supabase = await createServerSupabase();
  const [{ data: userData }, { data: bids }, { data: canonicalPlayers, error: canonicalPlayersError }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("free_agency_avg_bids").select("player_name, avg_bid"),
    supabase.from("player_pool").select("season_key, display_name, role, rank, opgg_url"),
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

  const initialAvgBids = Object.fromEntries(
    (bids ?? []).map((bid) => [bid.player_name, bid.avg_bid]),
  );

  const seasons = adaptCanonicalPlayerPool(canonicalPlayers ?? []);
  const emptyStateMessages = {
    "season-4": "Season 4 player data has not been added yet.",
    ...(canonicalPlayersError || seasons["season-5"].every((section) => section.players.length === 0)
      ? { "season-5": "Player List data is unavailable for Season 5 right now." }
      : {}),
  };

  return (
    <PlayersDirectory
      seasons={seasons}
      isAdmin={isAdmin}
      initialAvgBids={initialAvgBids}
      freeAgencyPlayers={FREE_AGENCY_PLAYER_SUMMARIES}
      emptyStateMessages={emptyStateMessages}
    />
  );
}
