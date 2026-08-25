import type { SupabaseClient } from "@supabase/supabase-js";

export type LeagueKey = "premier" | "academy";
export type PlayerIdentityStatus = "unlinked" | "pending" | "approved" | "approved_unrostered";

export type ResolvedPlayerIdentity = {
  profileId: string | null;
  status: PlayerIdentityStatus;
  linkId: string | null;
  playerPoolId: string | null;
  leagueTeamId: string | null;
  season: string;
  isCaptain: boolean;
  isAdmin: boolean;
};

type SettingsRow = { current_season: string | null; academy_season: string | null };
type IdentityLinkRow = {
  id: string;
  player_pool_id: string;
  league_team_id: string | null;
  status: "pending" | "approved";
};

function emptyIdentity(season: string): ResolvedPlayerIdentity {
  return {
    profileId: null,
    status: "unlinked",
    linkId: null,
    playerPoolId: null,
    leagueTeamId: null,
    season,
    isCaptain: false,
    isAdmin: false,
  };
}

/**
 * Resolves only the authenticated caller's identity. The session-derived
 * profile id is deliberately not an argument: callers can select a player or
 * team for UI purposes, but can never select the profile whose access they
 * receive. RLS is the final data boundary for the identity-link read.
 */
export async function resolvePlayerIdentity(
  supabase: SupabaseClient,
  league: LeagueKey,
): Promise<ResolvedPlayerIdentity> {
  const [{ data: userData }, { data: settingsData }] = await Promise.all([
    supabase.auth.getUser(),
    supabase
      .from("league_settings")
      .select("current_season, academy_season")
      .eq("id", 1)
      .single(),
  ]);
  const settings = settingsData as SettingsRow | null;
  const season = (league === "academy" ? settings?.academy_season : settings?.current_season) ?? "";
  const profileId = userData.user?.id ?? null;
  if (!profileId) return emptyIdentity(season);

  const [profileResult, captainResult, linkResult] = await Promise.all([
    supabase.from("profiles").select("is_admin").eq("id", profileId).single(),
    season
      ? supabase
          .from("league_team_captains")
          .select("league_team_id")
          .eq("profile_id", profileId)
          .eq("season", season)
      : Promise.resolve({ data: [] as { league_team_id: string }[] }),
    season
      ? supabase
          .from("player_identity_links")
          .select("id, player_pool_id, league_team_id, status")
          .eq("profile_id", profileId)
          .eq("league", league)
          .eq("season", season)
          .maybeSingle()
      : Promise.resolve({ data: null as IdentityLinkRow | null }),
  ]);

  const link = linkResult.data as IdentityLinkRow | null;
  const isCaptain = ((captainResult.data as { league_team_id: string }[] | null) ?? []).length > 0;
  const isAdmin = Boolean((profileResult.data as { is_admin: boolean } | null)?.is_admin);
  const status: PlayerIdentityStatus = !link
    ? "unlinked"
    : link.status === "pending"
      ? "pending"
      : link.league_team_id
        ? "approved"
        : "approved_unrostered";

  return {
    profileId,
    status,
    linkId: link?.id ?? null,
    playerPoolId: link?.player_pool_id ?? null,
    leagueTeamId: link?.league_team_id ?? null,
    season,
    isCaptain,
    isAdmin,
  };
}
