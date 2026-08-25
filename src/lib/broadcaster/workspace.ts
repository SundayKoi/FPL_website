import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAcademyDraftData } from "@/lib/academy/draft";
import { filterAcademyFixtures } from "@/lib/academy/filtering";
import { fetchCaptainContext, fetchMyRoster } from "@/lib/captain/queries";
import { matchTeamId, normalizeName } from "@/lib/captain/teamNames";
import { fetchHomepageFeaturedSettings, type HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import { fetchHomepageSchedule, selectHomepageFeaturedFixture } from "@/lib/home/schedule";
import { academyTeamNames, type LeagueView } from "@/lib/league/context";
import type { LeagueTeam } from "@/lib/matches/types";
import type { FixtureRow } from "@/lib/schedule/types";
import { fetchInhousePlayerStats, fetchScoutingHistory } from "@/lib/scouting/queries";
import type { ScoutRosterPlayer, ScoutSource } from "@/lib/scouting/types";
import type { InhousePlayerStats } from "@/lib/scouting/inhouse";

export interface BroadcasterFixtureContext {
  league: LeagueView;
  season: string;
  teams: LeagueTeam[];
  fixture: FixtureRow | null;
  settings: HomepageFeaturedSettings;
}

export interface BroadcasterScoutingData {
  teamA: ScoutSource;
  teamB: ScoutSource;
}

/** Resolve the homepage's selected fixture within its own Premier or Academy schedule. */
export async function resolveBroadcasterFixture(
  supabase: SupabaseClient,
  league: LeagueView,
): Promise<BroadcasterFixtureContext> {
  const captain = await fetchCaptainContext(supabase, league);
  const academyDraft = league === "academy" ? await fetchAcademyDraftData(supabase) : null;
  const [schedule, settings] = await Promise.all([
    league === "academy"
      ? fetchHomepageSchedule((fixtures) => filterAcademyFixtures(fixtures, academyTeamNames(academyDraft?.teams ?? [])))
      : fetchHomepageSchedule(),
    fetchHomepageFeaturedSettings(league),
  ]);

  return {
    league,
    season: captain.season,
    teams: captain.teams,
    fixture: selectHomepageFeaturedFixture(schedule.fixtures, settings.fixtureId),
    settings,
  };
}

function rosterPlayers(roster: Awaited<ReturnType<typeof fetchMyRoster>> | null): ScoutRosterPlayer[] {
  return (roster?.draftPlayers ?? []).map((player) => ({
    id: player.id,
    displayName: player.display_name,
    role: player.role,
  }));
}

function scopedInhousePlayers(
  roster: ScoutRosterPlayer[],
  inhousePlayerStats: InhousePlayerStats[],
): InhousePlayerStats[] {
  const rosterIds = new Set(roster.map((player) => player.id));
  return inhousePlayerStats.filter((player) => rosterIds.has(player.playerId));
}

/** Load both team scouting views from one shared history and in-house-stat query. */
export async function loadBroadcasterScouting(
  supabase: SupabaseClient,
  context: BroadcasterFixtureContext,
): Promise<BroadcasterScoutingData | null> {
  const fixture = context.fixture;
  const teamAName = fixture?.team_a?.trim() ?? "";
  const teamBName = fixture?.team_b?.trim() ?? "";
  if (!fixture || !teamAName || !teamBName) return null;

  const teamAId = matchTeamId(context.teams, teamAName);
  const teamBId = matchTeamId(context.teams, teamBName);
  const historyTeamNames = [...new Map(
    [...context.teams.map((team) => team.name), teamAName, teamBName]
      .map((name) => [normalizeName(name), name.trim()] as const)
      .filter(([key]) => Boolean(key)),
  ).values()];
  const [history, teamARosterData, teamBRosterData] = await Promise.all([
    fetchScoutingHistory(supabase, {
      league: context.league,
      leagueTeamNames: historyTeamNames,
    }),
    teamAId ? fetchMyRoster(supabase, teamAId, context.season, context.league) : Promise.resolve(null),
    teamBId ? fetchMyRoster(supabase, teamBId, context.season, context.league) : Promise.resolve(null),
  ]);
  const teamARoster = rosterPlayers(teamARosterData);
  const teamBRoster = rosterPlayers(teamBRosterData);
  const inhousePlayerStats = await fetchInhousePlayerStats(supabase, [...teamARoster, ...teamBRoster]);

  const source = (
    teamName: string,
    roster: ScoutRosterPlayer[],
    scopedStats: InhousePlayerStats[],
  ): ScoutSource => ({
    ...history,
    opponentName: teamName,
    teamName,
    currentSeason: context.season,
    nextFixture: fixture,
    roster,
    inhousePlayerStats: scopedStats,
  });

  return {
    teamA: source(teamAName, teamARoster, scopedInhousePlayers(teamARoster, inhousePlayerStats)),
    teamB: source(teamBName, teamBRoster, scopedInhousePlayers(teamBRoster, inhousePlayerStats)),
  };
}
