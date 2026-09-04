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
import { combineTeamRows } from "@/lib/stats/formulas";
import type { TeamAggRow } from "@/lib/stats/types";
import { DEFAULT_TEAM_BANNER_COLOR, normalizeBannerColor } from "@/lib/teams/bannerColor";
import { createLeagueTeamScope } from "./leagueScope";
import type { MyTeamBrand, MyTeamDashboardResult, MyTeamOpponent } from "./types";

type LeagueSettingsRow = {
  featured_draft_id: string | null;
  academy_draft_id: string | null;
};

const TEAM_AGG_SELECT = [
  "team_name",
  "season",
  "season_phase",
  "games",
  "wins",
  "losses",
  "winrate_pct",
  "avg_duration_min",
  "dragon_rate",
  "baron_rate",
  "first_blood_rate",
  "first_tower_rate",
  "avg_team_kills",
].join(", ");

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
): Promise<{
  teams: LeagueTeam[];
  activeTeams: LeagueTeam[];
  brands: Map<string, MyTeamBrand>;
}> {
  const settingsResult = await supabase
    .from("league_settings")
    .select("featured_draft_id, academy_draft_id")
    .eq("id", 1)
    .single();
  throwIfError(settingsResult.error);

  const settings = settingsResult.data as LeagueSettingsRow | null;
  const draftId = league === "academy" ? settings?.academy_draft_id : settings?.featured_draft_id;
  if (!draftId) return { teams: [], activeTeams: [], brands: new Map() };

  const [leagueTeamsResult, draftTeamsResult] = await Promise.all([
    supabase.from("league_teams").select("*").order("name"),
    supabase.from("teams").select("name, image_url, banner_color").eq("draft_id", draftId),
  ]);
  throwIfError(leagueTeamsResult.error);
  throwIfError(draftTeamsResult.error);

  const brands = new Map(
    (((draftTeamsResult.data as { name: string; image_url: string | null; banner_color: string | null }[] | null) ?? [])
      .map((team) => [
        normalizeName(team.name),
        {
          imageUrl: team.image_url,
          bannerColor: normalizeBannerColor(team.banner_color),
        },
      ] as const)),
  );
  const draftTeamNames = new Set(brands.keys());
  const teams = ((leagueTeamsResult.data as LeagueTeam[] | null) ?? [])
    .filter((team) => draftTeamNames.has(normalizeName(team.name)));
  return { teams, activeTeams: activeOnly(teams), brands };
}

function leagueFixtures(
  fixtures: FixtureRow[],
  teams: LeagueTeam[],
): FixtureRow[] {
  const scope = createLeagueTeamScope(teams);
  return fixtures.filter((fixture) => scope.includesFixture(fixture));
}

function teamFixtures(fixtures: FixtureRow[], teamName: string): FixtureRow[] {
  const name = normalizeName(teamName);
  return fixtures.filter(
    (fixture) => normalizeName(fixture.team_a) === name || normalizeName(fixture.team_b) === name,
  );
}

async function fetchOpponentStats(
  supabase: SupabaseClient,
  opponentName: string,
  season: string,
): Promise<TeamAggRow | null> {
  const result = await supabase
    .from("stats_team_agg")
    .select(TEAM_AGG_SELECT)
    .eq("season", season)
    .order("team_name")
    .order("season_phase");
  throwIfError(result.error);

  const rows = ((result.data as TeamAggRow[] | null) ?? []).filter(
    (row) => normalizeName(row.team_name) === normalizeName(opponentName),
  );
  if (rows.length === 0) return null;
  return { ...combineTeamRows(rows, season), team_name: opponentName };
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
      const { activeTeams } = await loadLeagueTeams(supabase, league);
      return { kind: "unlinked", season: identity.season, availableTeams: activeTeams };
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

  const { teams, activeTeams, brands } = await loadLeagueTeams(supabase, league);
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
      return { kind: "unlinked", season: identity.season, availableTeams: activeTeams };
    }
    return {
      kind: "unrostered",
      season: identity.season,
      playerPoolId: identity.playerPoolId,
    };
  }

  const teamWithBrand = {
    ...team,
    ...(brands.get(normalizeName(team.name)) ?? {
      imageUrl: null,
      bannerColor: DEFAULT_TEAM_BANNER_COLOR,
    }),
  };

  const fixturesResult = await supabase
    .from("fixtures")
    .select("*")
    .eq("season", identity.season);
  throwIfError(fixturesResult.error);
  const fixtures = leagueFixtures(
    (fixturesResult.data as FixtureRow[] | null) ?? [],
    teams,
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
        const rosterPromise = opponentTeamId
          ? fetchMyRoster(supabase, opponentTeamId, identity.season, league)
              .then((roster) => ({ roster, scoutingUnavailable: false }))
              .catch(() => ({ roster: null, scoutingUnavailable: true }))
          : Promise.resolve({ roster: null, scoutingUnavailable: false });
        const statsPromise = fetchOpponentStats(supabase, opponentName, identity.season)
          .then((stats) => ({ stats, statsUnavailable: false }))
          .catch(() => ({ stats: null, statsUnavailable: true }));
        const [rosterResult, statsResult] = await Promise.all([rosterPromise, statsPromise]);
        return {
          team: opponentTeam,
          name: opponentName,
          roster: rosterResult.roster,
          multiOpggUrl: rosterResult.roster ? multiOpggUrl(rosterResult.roster) : null,
          scoutingUnavailable: rosterResult.scoutingUnavailable,
          stats: statsResult.stats,
          statsUnavailable: statsResult.statsUnavailable,
        };
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
    team: teamWithBrand,
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
