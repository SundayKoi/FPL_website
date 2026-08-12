import PlayersDirectory from "@/components/players/PlayersDirectory";
import { PLAYER_SEASONS } from "@/lib/players/seasonData";
import { FREE_AGENCY_PLAYER_SUMMARIES } from "@/lib/players/freeAgencyData";
import { createServerSupabase } from "@/lib/supabase/server";

export default async function PlayersPage() {
  const supabase = await createServerSupabase();
  const [{ data: userData }, { data: bids }] = await Promise.all([
    supabase.auth.getUser(),
    supabase.from("free_agency_avg_bids").select("player_name, avg_bid"),
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

  return (
    <PlayersDirectory
      seasons={PLAYER_SEASONS}
      isAdmin={isAdmin}
      initialAvgBids={initialAvgBids}
      freeAgencyPlayers={FREE_AGENCY_PLAYER_SUMMARIES}
    />
  );
}
