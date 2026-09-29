import type { Metadata } from "next";
import Link from "next/link";
import PlayersDirectory from "@/components/players/PlayersDirectory";
import { FREE_AGENCY_PLAYER_SUMMARIES } from "@/lib/players/freeAgencyData";
import { adaptCanonicalPlayerPool } from "@/lib/players/freeAgency";
import { primaryLinkedAccountUrl } from "@/lib/players/linkedAccounts";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";

export const metadata: Metadata = {
  title: "Players — FPL",
};

export default async function PlayersPage() {
  const supabase = await createServerSupabase();
  const [{ isAdmin, isOwner }, { data: bids }, { data: canonicalPlayers, error: canonicalPlayersError }] = await Promise.all([
    fetchStaffTier(supabase),
    supabase.from("free_agency_avg_bids").select("player_name, avg_bid"),
    supabase.from("player_pool").select("id, season_key, display_name, role, rank, opgg_url").eq("season_key", "season-5"),
  ]);

  const linkedPlayers = (canonicalPlayers ?? []).map((player) => ({
    ...player,
    opgg_url: primaryLinkedAccountUrl(player.display_name) ?? (player.opgg_url?.trim() ? player.opgg_url : null),
  }));
  const seasons = adaptCanonicalPlayerPool(linkedPlayers);
  const initialAvgBids = Object.fromEntries((bids ?? []).map((bid) => [bid.player_name, bid.avg_bid]));
  const emptyStateMessages = {
    "season-4": "Season 4 player data has not been added yet.",
    ...(canonicalPlayersError || seasons["season-5"].every((section) => section.players.length === 0)
      ? { "season-5": "Player List data is unavailable for Season 5 right now." }
      : {}),
  };

  return (
    <>
      {isAdmin || isOwner ? (
        <div className="mx-auto w-full max-w-6xl px-4 pt-5 sm:px-6 lg:px-8">
          <Link href="/admin/league/players?league=premier" className="text-sm font-semibold text-action-text underline underline-offset-4">
            Manage the player pool in Admin →
          </Link>
        </div>
      ) : null}
      <PlayersDirectory
        seasons={seasons}
        canonicalPlayers={[]}
        isAdmin={false}
        isOwner={false}
        initialAvgBids={initialAvgBids}
        freeAgencyPlayers={FREE_AGENCY_PLAYER_SUMMARIES}
        emptyStateMessages={emptyStateMessages}
      />
    </>
  );
}
