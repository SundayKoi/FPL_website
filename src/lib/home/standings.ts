import { createServerSupabase } from "@/lib/supabase/server";
import { PREMIER_SEASON } from "./awards";
import { fetchDraftId } from "./fetchDraftId";
import { normalizeTeamName } from "@/lib/league/context";
import { FIXTURE_STAGES, type FixtureStage } from "@/lib/schedule/types";
import { stageMeta } from "@/lib/schedule/format";

export interface HomeStandingTeam {
  id: string;
  name: string;
  abbreviation: string;
  nomination_position: number;
  division?: string | null;
  wins: number;
  losses: number;
  winrate_pct?: number;
  /** Individual GAMES won and lost inside those series — a 2-1 series win is
   *  one series win and two game wins. Standings tiebreaker 2. */
  game_wins?: number;
  game_losses?: number;
  game_winrate_pct?: number;
  /** Mean total length, in minutes, of the series this team WON — every game
   *  of a won series added up, then averaged over those series. Quickest is
   *  best (tiebreaker 4). Undefined when no won series has a duration on
   *  record, which sorts last rather than first. */
  avg_win_minutes?: number;
  /** Chronological series results, oldest first (last 5) — drives the form
   *  dots and hover detail on the homepage standings. */
  form?: ("W" | "L")[];
  /** The team's next unplayed fixture opponent, if one is scheduled. */
  next_opponent?: string | null;
}

type TeamRow = Pick<HomeStandingTeam, "id" | "name" | "abbreviation" | "nomination_position" | "division">;

export interface StandingsFixture {
  /** Needed only to look a series up in the duration map (tiebreaker 4);
   *  every other derivation here works without it. */
  id?: string;
  season: string;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  /** Optional ordering columns — needed for form/next-opponent and the race
   *  chart; deriveSeriesStandings itself works without them. */
  stage?: FixtureStage;
  sort_order?: number;
}

/** One frame of the standings race chart: cumulative records through a stage. */
export interface RaceWeek {
  stage: FixtureStage;
  label: string;
  entries: { id: string; name: string; abbreviation: string; wins: number; losses: number }[];
}

export interface HomeStandingsData {
  teams: HomeStandingTeam[];
  race: RaceWeek[];
}

function stageIndex(stage: FixtureStage | undefined): number {
  return stage ? FIXTURE_STAGES.indexOf(stage) : 0;
}

/** Season fixtures in play order (stage, then sort_order). */
function orderedSeasonFixtures(fixtures: StandingsFixture[], season: string): StandingsFixture[] {
  return fixtures
    .filter((fixture) => fixture.season === season)
    .sort((a, b) => stageIndex(a.stage) - stageIndex(b.stage) || (a.sort_order ?? 0) - (b.sort_order ?? 0));
}

function isCompleted(fixture: StandingsFixture): boolean {
  return fixture.score_a !== null && fixture.score_b !== null && fixture.score_a !== fixture.score_b;
}

/** Per-team recent form (last 5 series, oldest first) and next opponent. */
export function deriveTeamExtras(
  fixtures: StandingsFixture[],
  season: string,
  teamName: string,
): { form: ("W" | "L")[]; next_opponent: string | null } {
  const key = normalizeTeamName(teamName);
  const ordered = orderedSeasonFixtures(fixtures, season).filter(
    (fixture) => normalizeTeamName(fixture.team_a) === key || normalizeTeamName(fixture.team_b) === key,
  );

  const form = ordered
    .filter(isCompleted)
    .map((fixture) => {
      const isA = normalizeTeamName(fixture.team_a) === key;
      const won = isA ? fixture.score_a! > fixture.score_b! : fixture.score_b! > fixture.score_a!;
      return won ? ("W" as const) : ("L" as const);
    })
    .slice(-5);

  const next = ordered.find((fixture) => fixture.score_a === null && fixture.score_b === null);
  const next_opponent = next
    ? normalizeTeamName(next.team_a) === key
      ? next.team_b
      : next.team_a
    : null;

  return { form, next_opponent: next_opponent ?? null };
}

/** Cumulative standings after each stage that has a completed series — the
 *  frames of the homepage race chart, oldest stage first. */
export function deriveStandingsRace(
  fixtures: StandingsFixture[],
  season: string,
  teams: TeamRow[],
): RaceWeek[] {
  const ordered = orderedSeasonFixtures(fixtures, season).filter(isCompleted);
  const playedStages = [...new Set(ordered.map((fixture) => fixture.stage).filter(Boolean))] as FixtureStage[];
  playedStages.sort((a, b) => stageIndex(a) - stageIndex(b));

  return playedStages.map((stage) => {
    const through = ordered.filter((fixture) => stageIndex(fixture.stage) <= stageIndex(stage));
    const standings = deriveSeriesStandings(through, season, teams);
    return {
      stage,
      label: stageMeta(stage).label,
      entries: standings.map((team) => ({
        id: team.id,
        name: team.name,
        abbreviation: team.abbreviation,
        wins: team.wins,
        losses: team.losses,
      })),
    };
  });
}

/**
 * Series records, not game records.
 *
 * The homepage used to derive standings from raw_stats, which counts
 * individual games: a team that won a Bo3 2-1 showed as "2-1", and one that
 * won 2-0 showed as "2-0", so both a win and its margin were mixed into the
 * same column and every team looked like it had played more than it had.
 * A fixture's score IS the series, so one row here is one series.
 *
 * Reading fixtures rather than raw_stats also means a reported result stands
 * up on the homepage without waiting on the stats ingest to resolve sides.
 *
 * TIEBREAKERS, in the league's order. Series record decides the table; when
 * two teams share one, these settle it:
 *   1. series record       — wins first, then fewer losses
 *   2. game win percentage — games won over games played, so a 2-0 sweep
 *                            outranks a 2-1 grind on the same series record
 *   3. head-to-head        — the mini-league among the tied teams only
 *   4. average win time    — mean total length of their series wins, quickest
 *                            first; unknown durations sort last
 *   5. name, so the order is stable rather than arbitrary
 *
 * Head-to-head cannot be a pairwise comparator: with three teams tied, A over
 * B over C over A is a real possibility and a sort given that comparator
 * returns whatever order it happened to start in. So the first two keys sort
 * normally, teams still exactly level on them are grouped, and each group is
 * resolved on its own mini-table.
 */
interface Tally {
  wins: number;
  losses: number;
  gameWins: number;
  gameLosses: number;
  /** Total length of each series this team won, one entry per series. */
  winMinutes: number[];
}

const emptyTally = (): Tally => ({ wins: 0, losses: 0, gameWins: 0, gameLosses: 0, winMinutes: [] });

/** Series wins and losses between one pair of teams. */
type HeadToHead = Map<string, Map<string, { wins: number; losses: number }>>;

export function deriveSeriesStandings(
  fixtures: StandingsFixture[],
  season: string,
  teams: TeamRow[],
  /** fixture id -> total minutes of every game in that series. Absent for a
   *  caller that has no stats to hand (the race chart, most tests), which
   *  simply leaves tiebreaker 4 with nothing to say. */
  seriesMinutes?: Map<string, number>,
): HomeStandingTeam[] {
  const record = new Map<string, Tally>();
  const h2h: HeadToHead = new Map();
  const tally = (key: string): Tally => {
    const entry = record.get(key) ?? emptyTally();
    record.set(key, entry);
    return entry;
  };

  for (const fixture of fixtures) {
    if (fixture.season !== season) continue;
    if (fixture.score_a === null || fixture.score_b === null) continue;
    if (fixture.score_a === fixture.score_b) continue; // a series has a winner
    const a = normalizeTeamName(fixture.team_a);
    const b = normalizeTeamName(fixture.team_b);
    if (!a || !b) continue;
    const aWon = fixture.score_a > fixture.score_b;

    for (const [key, own, opp, won] of [
      [a, fixture.score_a, fixture.score_b, aWon],
      [b, fixture.score_b, fixture.score_a, !aWon],
    ] as const) {
      const entry = tally(key);
      if (won) entry.wins += 1;
      else entry.losses += 1;
      // The score IS the game count inside the series, so a 2-1 gives the
      // winner two game wins and one game loss.
      entry.gameWins += own;
      entry.gameLosses += opp;
      const minutes = fixture.id ? seriesMinutes?.get(fixture.id) : undefined;
      if (won && typeof minutes === "number" && minutes > 0) entry.winMinutes.push(minutes);
    }

    for (const [key, other, won] of [
      [a, b, aWon],
      [b, a, !aWon],
    ] as const) {
      const row = h2h.get(key) ?? new Map();
      const pair = row.get(other) ?? { wins: 0, losses: 0 };
      if (won) pair.wins += 1;
      else pair.losses += 1;
      row.set(other, pair);
      h2h.set(key, row);
    }
  }

  // Driven by the draft roster rather than by whoever appears in a fixture, so
  // a team that has not played yet still shows at 0-0 instead of vanishing.
  const rows = teams.map((team) => {
    const entry = record.get(normalizeTeamName(team.name)) ?? emptyTally();
    const played = entry.wins + entry.losses;
    const gamesPlayed = entry.gameWins + entry.gameLosses;
    const mean =
      entry.winMinutes.length > 0
        ? entry.winMinutes.reduce((sum, value) => sum + value, 0) / entry.winMinutes.length
        : undefined;
    return {
      ...team,
      wins: entry.wins,
      losses: entry.losses,
      winrate_pct: played === 0 ? 0 : Number(((100 * entry.wins) / played).toFixed(1)),
      game_wins: entry.gameWins,
      game_losses: entry.gameLosses,
      game_winrate_pct: gamesPlayed === 0 ? 0 : Number(((100 * entry.gameWins) / gamesPlayed).toFixed(1)),
      avg_win_minutes: mean === undefined ? undefined : Number(mean.toFixed(1)),
    };
  });

  // Keys 1 and 2 first; head-to-head only ever reorders teams already level
  // on both, so it can be applied group by group afterwards.
  rows.sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      (b.game_winrate_pct ?? 0) - (a.game_winrate_pct ?? 0),
  );

  const level = (a: HomeStandingTeam, b: HomeStandingTeam) =>
    a.wins === b.wins && a.losses === b.losses && (a.game_winrate_pct ?? 0) === (b.game_winrate_pct ?? 0);

  const ordered: HomeStandingTeam[] = [];
  for (let start = 0; start < rows.length; ) {
    let end = start + 1;
    while (end < rows.length && level(rows[start], rows[end])) end += 1;
    ordered.push(...breakTie(rows.slice(start, end), h2h));
    start = end;
  }
  return ordered;
}

/**
 * Order one group of teams that are level on record and game win percentage.
 *
 * Head-to-head is read as a mini-league: only results against the OTHER
 * members of this group count, which is what makes a three-way tie resolvable
 * at all. A pair inside the group that never met contributes nothing to
 * either side, and a team with no mini-league games sits at the neutral 50%
 * so an unplayed matchup neither rewards nor punishes it.
 */
function breakTie(group: HomeStandingTeam[], h2h: HeadToHead): HomeStandingTeam[] {
  if (group.length < 2) return group;
  const keys = new Set(group.map((team) => normalizeTeamName(team.name)));

  const miniLeague = new Map<string, number>();
  for (const team of group) {
    const key = normalizeTeamName(team.name);
    let wins = 0;
    let losses = 0;
    for (const [other, pair] of h2h.get(key) ?? []) {
      if (other === key || !keys.has(other)) continue;
      wins += pair.wins;
      losses += pair.losses;
    }
    miniLeague.set(key, wins + losses === 0 ? 50 : (100 * wins) / (wins + losses));
  }

  // Infinity, not 0: a team whose won series have no duration on record must
  // not win the "quickest" tiebreaker by having no time at all.
  const winTime = (team: HomeStandingTeam) => team.avg_win_minutes ?? Number.POSITIVE_INFINITY;

  return [...group].sort(
    (a, b) =>
      (miniLeague.get(normalizeTeamName(b.name)) ?? 50) - (miniLeague.get(normalizeTeamName(a.name)) ?? 50) ||
      winTime(a) - winTime(b) ||
      a.name.localeCompare(b.name),
  );
}

/**
 * fixture id -> total minutes of every game in that series, for tiebreaker 4.
 *
 * Joined on IDS the whole way — fixture -> match_reports.fixture_id ->
 * match_report_games.match_id -> raw_stats — rather than by matching team
 * names and dates. The name-and-date join is the one that already put five
 * fixtures on the floor in betting settlement; a wrong duration here would
 * silently reorder the table.
 *
 * Returns an empty map on any failure. Tiebreaker 4 then has nothing to say
 * and the order falls through to the team name, which is what it did before
 * this existed — a standings table is worth more than a perfect fourth
 * tiebreaker.
 */
async function fetchSeriesMinutes(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  season: string,
): Promise<Map<string, number>> {
  const minutes = new Map<string, number>();
  try {
    const [reports, logs] = await Promise.all([
      supabase
        .from("match_reports")
        .select("fixture_id, match_report_games(match_id)")
        .eq("season", season)
        .not("fixture_id", "is", null),
      supabase.from("stats_game_log").select("match_id, duration_min").eq("season", season),
    ]);

    const duration = new Map<string, number>();
    for (const log of ((logs.data as { match_id: string; duration_min: number | null }[]) ?? [])) {
      if (typeof log.duration_min === "number") duration.set(log.match_id, log.duration_min);
    }

    // A disputed series can be re-reported, so several match_reports rows may
    // carry the same fixture_id and list the same games. Collect the distinct
    // match_ids per FIXTURE first, then add the durations up once — summing
    // report by report would double the length of every re-reported series.
    type ReportRow = { fixture_id: string | null; match_report_games: { match_id: string }[] | null };
    const matchesByFixture = new Map<string, Set<string>>();
    for (const report of ((reports.data as ReportRow[]) ?? [])) {
      if (!report.fixture_id) continue;
      const seen = matchesByFixture.get(report.fixture_id) ?? new Set<string>();
      for (const game of report.match_report_games ?? []) seen.add(game.match_id);
      matchesByFixture.set(report.fixture_id, seen);
    }

    for (const [fixtureId, matchIds] of matchesByFixture) {
      let total = 0;
      for (const matchId of matchIds) total += duration.get(matchId) ?? 0;
      if (total > 0) minutes.set(fixtureId, total);
    }
  } catch {
    return new Map();
  }
  return minutes;
}

/**
 * Standings for one league's homepage. Premier reads the featured draft and
 * its own season; Academy passes its draft column, season code and team names
 * so the two never mix (they share raw_stats and the teams table).
 */
export async function fetchHomepageStandings(
  season: string = PREMIER_SEASON,
  teamNames?: string[],
  draftColumn: "featured_draft_id" | "academy_draft_id" = "featured_draft_id",
): Promise<HomeStandingsData> {
  const supabase = await createServerSupabase();
  const featuredDraftId = await fetchDraftId(supabase, draftColumn);
  if (!featuredDraftId) return { teams: [], race: [] };

  const { data: teams, error: teamsError } = await supabase
    .from("teams")
    .select("id, name, abbreviation, nomination_position, division")
    .eq("draft_id", featuredDraftId)
    .order("nomination_position", { ascending: true });

  if (teamsError) throw teamsError;
  const draftTeams = (teams ?? []) as TeamRow[];
  if (draftTeams.length === 0) return { teams: [], race: [] };

  const scoped = teamNames?.length
    ? draftTeams.filter((team) => teamNames.some((name) => normalizeTeamName(name) === normalizeTeamName(team.name)))
    : draftTeams;

  try {
    const { data: fixturesData } = await supabase
      .from("fixtures")
      .select("id, season, team_a, team_b, score_a, score_b, stage, sort_order")
      .eq("season", season);
    const fixtures = (fixturesData as StandingsFixture[]) ?? [];
    const seriesMinutes = await fetchSeriesMinutes(supabase, season);
    const standings = deriveSeriesStandings(fixtures, season, scoped, seriesMinutes).map((team) => ({
      ...team,
      ...deriveTeamExtras(fixtures, season, team.name),
    }));
    return { teams: standings, race: deriveStandingsRace(fixtures, season, scoped) };
  } catch {
    // A fixtures outage should leave the roster on screen at 0-0 rather than
    // blanking the panel.
    return { teams: scoped.map((team) => ({ ...team, wins: 0, losses: 0 })), race: [] };
  }
}
