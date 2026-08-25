import type { SupabaseClient } from "@supabase/supabase-js";
import {
  activeOnly,
  fetchCodes,
  fetchDraftGames,
  fetchMyResults,
  fetchMyRoster,
} from "@/lib/captain/queries";
import { pickNextFixture } from "@/lib/captain/nextMatch";
import { matchTeamId, normalizeName } from "@/lib/captain/teamNames";
import type { LeagueTeam } from "@/lib/matches/types";
import {
  opggMultiSearchUrlFromRiotIds,
  opggMultiSearchUrlFromRosterPlayers,
} from "@/lib/opgg/multiSearch";
import { resolvePlayerIdentity, type LeagueKey } from "@/lib/players/identity";
import type { FixtureRow } from "@/lib/schedule/types";
import type { MyTeamDashboardResult, MyTeamOpponent } from "./types";

type LeagueSettingsRow = {
  featured_draft_id: string | null;
  academy_draft_id: string | null;
};

function throwIfError(error: unknown): void {
  if (error) throw error;
}

function multiOpggUrl(roster: Awaited<ReturnType<typeof fetchMyRoster>>): string | null {
  return opggMultiSearchUrlFromRosterPlayers(roster.draftPlayers)
    ?? opggMultiSearchUrlFromRiotIds(roster.riotAccounts);
}

async function loadLeagueTeams(
  supabase: SupabaseClient,
  league: LeagueKey,
): Promise<{ teams: LeagueTeam[]; activeTeams: LeagueTeam[] }> {
  const settingsResult = await supabase
    .from("league_settings")
    .select("featured_draft_id, academy_draft_id")
    .eq("id", 1)
    .single();
  throwIfError(settingsResult.error);

  const settings = settingsResult.data as LeagueSettingsRow | null;
  const draftId = league === "academy" ? settings?.academy_draft_id : settings?.featured_draft_id;
  if (!draftId) return { teams: [], activeTeams: [] };

  const [leagueTeamsResult, draftTeamsResult] = await Promise.all([
    supabase.from("league_teams").select("*").order("name"),
    supabase.from("teams").select("name").eq("draft_id", draftId),
  ]);
  throwIfError(leagueTeamsResult.error);
  throwIfError(draftTeamsResult.error);

  const draftTeamNames = new Set(
    (((draftTeamsResult.data as { name: string }[] | null) ?? []).map((team) => normalizeName(team.name))),
  );
  const teams = ((leagueTeamsResult.data as LeagueTeam[] | null) ?? [])
    .filter((team) => draftTeamNames.has(normalizeName(team.name)));
  return { teams, activeTeams: activeOnly(teams) };
}

function leagueFixtures(
  fixtures: FixtureRow[],
  teams: LeagueTeam[],
  league: LeagueKey,
): FixtureRow[] {
  const names = new Set(teams.map((team) => normalizeName(team.name)));
  return fixtures.filter((fixture) => {
    const teamA = names.has(normalizeName(fixture.team_a));
    const teamB = names.has(normalizeName(fixture.team_b));
    return league === "academy" ? teamA || teamB : teamA && teamB;
  });
}

function teamFixtures(fixtures: FixtureRow[], teamName: string): FixtureRow[] {
  const name = normalizeName(teamName);
  return fixtures.filter(
    (fixture) => normalizeName(fixture.team_a) === name || normalizeName(fixture.team_b) === name,
  );
}

/**
 * Builds the request-scoped My Team DTO from the caller's cookie-bound
 * Supabase client. No profile, player, or captain identifier is accepted as
 * input. The only selectable identity is an admin team override, validated
 * against the selected league's active teams before any private read.
 */
export async function loadMyTeamDashboard(
  supabase: SupabaseClient,
  league: LeagueKey,
  adminTeamId?: string,
): Promise<MyTeamDashboardResult> {
  const identity = await resolvePlayerIdentity(supabase, league);
  if (!identity.profileId) return { kind: "signed-out", season: identity.season };

  if (!identity.isCaptain && !identity.isAdmin) {
    if (identity.status === "unlinked") {
      return { kind: "unlinked", season: identity.season };
    }
    if (identity.status === "pending") {
      if (!identity.linkId || !identity.playerPoolId) {
        throw new Error("Pending player identity is incomplete");
      }
      return {
        kind: "pending",
        season: identity.season,
        linkId: identity.linkId,
        playerPoolId: identity.playerPoolId,
        leagueTeamId: identity.leagueTeamId,
      };
    }
    if (identity.status === "approved_unrostered") {
      return {
        kind: "unrostered",
        season: identity.season,
        playerPoolId: identity.playerPoolId,
      };
    }
  }

  const { teams, activeTeams } = await loadLeagueTeams(supabase, league);
  const activeIds = new Set(activeTeams.map((team) => team.id));

  let captainTeamIds: string[] = [];
  if (identity.isCaptain && identity.season) {
    const captainResult = await supabase
      .from("league_team_captains")
      .select("league_team_id")
      .eq("profile_id", identity.profileId)
      .eq("season", identity.season);
    throwIfError(captainResult.error);
    captainTeamIds = ((captainResult.data as { league_team_id: string }[] | null) ?? [])
      .map((row) => row.league_team_id)
      .filter((teamId) => activeIds.has(teamId));
  }

  const linkedTeamId = identity.leagueTeamId && activeIds.has(identity.leagueTeamId)
    ? identity.leagueTeamId
    : null;
  const captainTeamId = captainTeamIds[0] ?? null;
  const activeTeamId = identity.isAdmin
    ? (adminTeamId && activeIds.has(adminTeamId) ? adminTeamId : activeTeams[0]?.id ?? null)
    : captainTeamId ?? linkedTeamId;
  const team = activeTeamId ? activeTeams.find((candidate) => candidate.id === activeTeamId) ?? null : null;

  if (!activeTeamId || !team) {
    if (identity.status === "pending" && identity.linkId && identity.playerPoolId) {
      return {
        kind: "pending",
        season: identity.season,
        linkId: identity.linkId,
        playerPoolId: identity.playerPoolId,
        leagueTeamId: identity.leagueTeamId,
      };
    }
    if (identity.status === "unlinked" && !identity.isCaptain && !identity.isAdmin) {
      return { kind: "unlinked", season: identity.season };
    }
    return {
      kind: "unrostered",
      season: identity.season,
      playerPoolId: identity.playerPoolId,
    };
  }

  const fixturesResult = await supabase
    .from("fixtures")
    .select("*")
    .eq("season", identity.season);
  throwIfError(fixturesResult.error);
  const fixtures = leagueFixtures(
    (fixturesResult.data as FixtureRow[] | null) ?? [],
    teams,
    league,
  );
  const schedule = teamFixtures(fixtures, team.name);
  const nextFixture = pickNextFixture(schedule, team.name);

  const opponentName = nextFixture
    ? normalizeName(nextFixture.team_a) === normalizeName(team.name)
      ? nextFixture.team_b?.trim() || null
      : nextFixture.team_a?.trim() || null
    : null;
  const opponentTeamId = opponentName ? matchTeamId(teams, opponentName) : null;
  const opponentTeam = opponentTeamId
    ? teams.find((candidate) => candidate.id === opponentTeamId) ?? null
    : null;

  const opponentPromise: Promise<MyTeamOpponent | null> = opponentName
    ? (async () => {
        if (!opponentTeamId) {
          return {
            team: null,
            name: opponentName,
            roster: null,
            multiOpggUrl: null,
            scoutingUnavailable: false,
          };
        }
        try {
          const roster = await fetchMyRoster(supabase, opponentTeamId, identity.season, league);
          return {
            team: opponentTeam,
            name: opponentName,
            roster,
            multiOpggUrl: multiOpggUrl(roster),
            scoutingUnavailable: false,
          };
        } catch {
          return {
            team: opponentTeam,
            name: opponentName,
            roster: null,
            multiOpggUrl: null,
            scoutingUnavailable: true,
          };
        }
      })()
    : Promise.resolve(null);

  const [codes, draftGames, roster, results, opponent] = await Promise.all([
    nextFixture ? fetchCodes(supabase, nextFixture.id) : Promise.resolve([]),
    nextFixture ? fetchDraftGames(supabase, nextFixture.id, teams) : Promise.resolve([]),
    fetchMyRoster(supabase, activeTeamId, identity.season, league),
    fetchMyResults(supabase, team.name, identity.season),
    opponentPromise,
  ]);

  return {
    kind: "ready",
    league,
    profileId: identity.profileId,
    playerPoolId: identity.playerPoolId,
    season: identity.season,
    team,
    teams,
    activeTeams,
    nextFixture,
    codes,
    draftGames,
    schedule,
    roster: { ...roster, multiOpggUrl: multiOpggUrl(roster) },
    opponent,
    results,
    isCaptain: captainTeamIds.includes(activeTeamId),
    isAdmin: identity.isAdmin,
  };
}
