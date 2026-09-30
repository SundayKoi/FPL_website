import type { SupabaseClient } from "@supabase/supabase-js";
import type { LeagueKey, PlayerRosterClaimState } from "@/lib/players/identity";

type RosterIdentity = {
  id: string;
  canonicalPlayerId: string | null;
};

export type RosterClaimPresentation = {
  state: PlayerRosterClaimState;
  claimLinkId: string | null;
};

export type RosterClaimTarget = RosterClaimPresentation & {
  playerPoolId: string;
  leagueTeamId: string;
  league: LeagueKey;
  season: string;
  returnPath: string;
  signedIn: boolean;
  unavailable: boolean;
};

export type RosterClaimTargetInput = {
  playerPoolId: string;
  leagueTeamId: string;
  returnPath: string;
};

const PUBLIC_STATES = new Set(["unclaimed", "pending", "claimed"]);
const UNAVAILABLE = "Roster claim status is unavailable";

export function buildRosterClaimTargets(
  entries: RosterClaimTargetInput[],
  states: Record<string, RosterClaimPresentation>,
  league: LeagueKey,
  season: string,
  signedIn: boolean,
  unavailable = false,
): Record<string, RosterClaimTarget> {
  return Object.fromEntries(entries.map((entry) => [
    entry.playerPoolId,
    {
      ...entry,
      league,
      season,
      signedIn,
      unavailable,
      state: states[entry.playerPoolId]?.state ?? "unclaimed",
      claimLinkId: states[entry.playerPoolId]?.claimLinkId ?? null,
    },
  ]));
}

export async function fetchRosterClaimTargets(
  supabase: SupabaseClient,
  entries: RosterClaimTargetInput[],
  league: LeagueKey,
  season: string,
  viewerProfileId: string | null,
): Promise<Record<string, RosterClaimTarget>> {
  if (!entries.length) return {};

  const states = await fetchRosterClaimStates(
    supabase,
    entries.map((entry) => ({ id: entry.playerPoolId, canonicalPlayerId: entry.playerPoolId })),
    league,
    season,
    viewerProfileId,
  );
  return buildRosterClaimTargets(entries, states, league, season, viewerProfileId !== null);
}

/** fetchRosterClaimTargets for a public roster page: no season means no
 *  claims, and a failed state read degrades to "status unavailable"
 *  targets so the roster still renders. */
export async function loadRosterClaimTargets(
  supabase: SupabaseClient,
  entries: RosterClaimTargetInput[],
  league: LeagueKey,
  season: string | null | undefined,
  viewerProfileId: string | null,
): Promise<Record<string, RosterClaimTarget>> {
  if (!entries.length || !season) return {};
  try {
    return await fetchRosterClaimTargets(supabase, entries, league, season, viewerProfileId);
  } catch {
    return buildRosterClaimTargets(entries, {}, league, season, viewerProfileId !== null, true);
  }
}

type DraftRosterPlayer = { canonical_player_id?: string | null; team_id: string | null };
type NamedTeam = { id: string; name: string };

/** One claim target per canonical player whose draft team matches an
 *  active league team by name. */
export function draftRosterClaimEntries(
  players: DraftRosterPlayer[],
  draftTeams: NamedTeam[],
  activeLeagueTeams: NamedTeam[],
  returnPath: (draftTeamName: string) => string,
): RosterClaimTargetInput[] {
  const activeTeamByName = new Map(activeLeagueTeams.map((team) => [team.name.trim().toLowerCase(), team.id]));
  return [
    ...new Map(
      players.flatMap((player) => {
        if (!player.canonical_player_id || !player.team_id) return [];
        const draftTeam = draftTeams.find((team) => team.id === player.team_id);
        if (!draftTeam) return [];
        const leagueTeamId = activeTeamByName.get(draftTeam.name.trim().toLowerCase());
        if (!leagueTeamId) return [];
        return [[
          player.canonical_player_id,
          { playerPoolId: player.canonical_player_id, leagueTeamId, returnPath: returnPath(draftTeam.name) },
        ] as const];
      }),
    ).values(),
  ];
}

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
    if (error || typeof data !== "string" || !PUBLIC_STATES.has(data)) {
      throw new Error(UNAVAILABLE);
    }
    const state = data as "unclaimed" | "pending" | "claimed";
    return [player.id, { state, claimLinkId: null }] as const;
  }));
  const result: Record<string, RosterClaimPresentation> = Object.fromEntries(neutralEntries);

  if (!viewerProfileId) return result;

  const { data: ownRow, error: ownRowError } = await supabase
    .from("player_identity_links")
    .select("id, player_pool_id, status")
    .eq("profile_id", viewerProfileId)
    .eq("league", league)
    .eq("season", season)
    .limit(1)
    .maybeSingle();
  if (ownRowError) throw new Error(UNAVAILABLE);
  const own = ownRow as { id: string; player_pool_id: string; status: "pending" | "approved" } | null;
  if (!own) return result;

  const matchingPlayer = canonicalRoster.find((player) => player.canonicalPlayerId === own.player_pool_id);
  if (!matchingPlayer) return result;
  result[matchingPlayer.id] = own.status === "approved"
    ? { state: "mine-approved", claimLinkId: null }
    : { state: "mine-pending", claimLinkId: own.id };
  return result;
}
