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
import { resolvePlayoffSeries, type PlayoffEntrant, type PlayoffReport } from "@/lib/schedule/playoffs";
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

async function isAwaitingPremierSemifinalDraw(
  supabase: SupabaseClient,
  season: string,
  teamId: string,
  schedule: FixtureRow[],
): Promise<boolean> {
  const quarterfinals = schedule.filter((fixture) => fixture.stage === "quarterfinals");
  const semifinals = schedule.filter((fixture) => fixture.stage === "semifinals");
  if (quarterfinals.length === 0 || semifinals.length !== 2
    || semifinals.some((fixture) => fixture.team_a !== null || fixture.team_b !== null)) return false;

  const [entrantsResult, reportsResult] = await Promise.all([
    supabase.from("premier_playoff_entrants").select("team_id, canonical_name, division, seed").eq("season", season),
    supabase.from("match_reports").select("*").in("fixture_id", quarterfinals.map((fixture) => fixture.id)),
  ]);
  if (entrantsResult.error || reportsResult.error) return false;
  const entrants = ((entrantsResult.data ?? []) as {
    team_id: string;
    canonical_name: string;
    division: "Solari" | "Lunari";
    seed: number;
  }[]).map((row): PlayoffEntrant => ({
    teamId: row.team_id,
    name: row.canonical_name,
    division: row.division,
    seed: row.seed,
  }));
  if (!entrants.some((entrant) => entrant.teamId === teamId)) return false;
  const reports = (reportsResult.data ?? []) as PlayoffReport[];
  const reportIds = reports.map((report) => report.id);
  const gamesResult = reportIds.length
    ? await supabase.from("match_report_games").select("id, report_id, game_number, status").in("report_id", reportIds)
    : { data: [], error: null };
  if (gamesResult.error) return false;
  const games = (gamesResult.data ?? []) as { id: string; report_id: string; game_number: number; status: string }[];
  const reportsWithGames = reports.map((report) => ({
    ...report,
    games: games.filter((game) => game.report_id === report.id)
      .map(({ id, game_number, status }) => ({ id, game_number, status })),
  }));
  return quarterfinals.some((fixture) => resolvePlayoffSeries(fixture, entrants, reportsWithGames).winnerTeamId === teamId);
}

async function resolvedPremierPlayoffReportFixtureIds(
  supabase: SupabaseClient,
  season: string,
  fixtures: FixtureRow[],
): Promise<Set<string>> {
  const playoffFixtures = fixtures.filter((fixture) =>
    fixture.stage === "quarterfinals" || fixture.stage === "semifinals" || fixture.stage === "finals",
  );
  if (playoffFixtures.length === 0) return new Set();

  const entrantsResult = await supabase
    .from("premier_playoff_entrants")
    .select("team_id, canonical_name, division, seed")
    .eq("season", season);
  if (entrantsResult.error || !entrantsResult.data?.length) return new Set();
  const entrants = (entrantsResult.data as {
    team_id: string;
    canonical_name: string;
    division: "Solari" | "Lunari";
    seed: number;
  }[]).map((row): PlayoffEntrant => ({
    teamId: row.team_id,
    name: row.canonical_name,
    division: row.division,
    seed: row.seed,
  }));

  const reportResult = await supabase
    .from("match_reports")
    .select("id, fixture_id, season, season_phase, team_a_id, team_b_id, score_a, score_b, status, submitted_at, forfeit_team_id")
    .eq("season", season)
    .in("fixture_id", playoffFixtures.map((fixture) => fixture.id));
  if (reportResult.error || !reportResult.data?.length) return new Set();
  const reports = reportResult.data as PlayoffReport[];
  const reportIds = reports.map((report) => report.id);
  const gamesResult = await supabase
    .from("match_report_games")
    .select("id, report_id, game_number, status")
    .in("report_id", reportIds);
  if (gamesResult.error) return new Set();
  const games = (gamesResult.data ?? []) as { id: string; report_id: string; game_number: number; status: string }[];
  const reportsWithGames = reports.map((report) => ({
    ...report,
    games: games.filter((game) => game.report_id === report.id)
      .map(({ id, game_number, status }) => ({ id, game_number, status })),
  }));

  return new Set(playoffFixtures
    .filter((fixture) => resolvePlayoffSeries(fixture, entrants, reportsWithGames).status === "ready")
    .map((fixture) => fixture.id));
}

export async function fetchTeamStats(
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
  const seasonFixtures = (fixturesResult.data as FixtureRow[] | null) ?? [];
  const fixtures = leagueFixtures(seasonFixtures, teams);
  const schedule = teamFixtures(fixtures, team.name);
  // Fixtures this season already has a submitted report for. The score
  // only reaches the fixture when the ingest syncs the report, and the
  // ingest does not run between two rounds played on one night, so without
  // this a reported round would stay "next" and hide the round after it.
  // Fails soft: an unreadable table leaves the score-only rule in place.
  const reportsResult = await supabase
    .from("match_reports")
    .select("fixture_id")
    .eq("season", identity.season);
  const reportedFixtureIds = new Set(
    reportsResult.error
      ? []
      : ((reportsResult.data as { fixture_id: string | null }[] | null) ?? [])
          .map((report) => report.fixture_id)
          .filter((id): id is string => Boolean(id)),
  );
  if (league === "premier") {
    const playoffFixtureIds = new Set(seasonFixtures
      .filter((fixture) => fixture.stage === "quarterfinals" || fixture.stage === "semifinals" || fixture.stage === "finals")
      .map((fixture) => fixture.id));
    const resolvedPlayoffIds = await resolvedPremierPlayoffReportFixtureIds(supabase, identity.season, seasonFixtures);
    for (const fixtureId of playoffFixtureIds) {
      // An unfinished or conflicted playoff report must leave its fixture in
      // the upcoming series list so the signed-in team can still see it.
      if (!resolvedPlayoffIds.has(fixtureId)) reportedFixtureIds.delete(fixtureId);
    }
  }
  const nextFixture = pickNextFixture(schedule, team.name, reportedFixtureIds);
  const awaitingPlayoffDrawPromise = league === "premier" && !nextFixture
    ? isAwaitingPremierSemifinalDraw(supabase, identity.season, team.id, seasonFixtures)
    : Promise.resolve(false);

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
        const statsPromise = fetchTeamStats(supabase, opponentName, identity.season)
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

  const [codes, draftGames, roster, results, opponent, awaitingPlayoffDraw] = await Promise.all([
    nextFixture ? fetchCodes(supabase, nextFixture.id) : Promise.resolve([]),
    nextFixture ? fetchDraftGames(supabase, nextFixture.id, teams) : Promise.resolve([]),
    fetchMyRoster(supabase, activeTeamId, identity.season, league),
    fetchMyResults(supabase, team.name, identity.season),
    opponentPromise,
    awaitingPlayoffDrawPromise,
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
    awaitingPlayoffDraw,
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
