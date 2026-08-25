import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueKey } from "@/lib/players/identity";
import type { PlayerRosterClaimState } from "@/components/teams/PlayerRosterClaim";

type RosterIdentity = {
  id: string;
  canonicalPlayerId: string | null;
};

export type RosterClaimPresentation = {
  state: PlayerRosterClaimState;
  claimLinkId: string | null;
};

const PUBLIC_STATES = new Set(["unclaimed", "pending", "claimed"]);

/** Combines a public-safe neutral state with, for an authenticated viewer,
 * one separately RLS-scoped self row. Profile IDs never leave this mapper. */
export async function fetchRosterClaimStates(
  supabase: SupabaseClient,
  roster: RosterIdentity[],
  league: LeagueKey,
  season: string,
  viewerProfileId: string | null,
): Promise<Record<string, RosterClaimPresentation>> {
  const canonicalRoster = roster.filter(
    (player): player is RosterIdentity & { canonicalPlayerId: string } => Boolean(player.canonicalPlayerId),
  );

  const neutralEntries = await Promise.all(canonicalRoster.map(async (player) => {
    const { data, error } = await supabase.rpc("player_identity_state", {
      p_player_pool_id: player.canonicalPlayerId,
      p_league: league,
      p_season: season,
    });
    const state = !error && typeof data === "string" && PUBLIC_STATES.has(data)
      ? data as "unclaimed" | "pending" | "claimed"
      : "unclaimed";
    return [player.id, { state, claimLinkId: null }] as const;
  }));
  const result: Record<string, RosterClaimPresentation> = Object.fromEntries(neutralEntries);

  if (!viewerProfileId) return result;

  const { data: ownRow } = await supabase
    .from("player_identity_links")
    .select("id, player_pool_id, status")
    .eq("profile_id", viewerProfileId)
    .eq("league", league)
    .eq("season", season)
    .limit(1)
    .maybeSingle();
  const own = ownRow as { id: string; player_pool_id: string; status: "pending" | "approved" } | null;
  if (!own) return result;

  const matchingPlayer = canonicalRoster.find((player) => player.canonicalPlayerId === own.player_pool_id);
  if (!matchingPlayer) return result;
  result[matchingPlayer.id] = own.status === "approved"
    ? { state: "mine-approved", claimLinkId: null }
    : { state: "mine-pending", claimLinkId: own.id };
  return result;
}
