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
  /** Chronological series results, oldest first (last 5) — drives the form
   *  dots and hover detail on the homepage standings. */
  form?: ("W" | "L")[];
  /** The team's next unplayed fixture opponent, if one is scheduled. */
  next_opponent?: string | null;
}

type TeamRow = Pick<HomeStandingTeam, "id" | "name" | "abbreviation" | "nomination_position" | "division">;

export interface StandingsFixture {
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
 */
export function deriveSeriesStandings(
  fixtures: StandingsFixture[],
  season: string,
  teams: TeamRow[],
): HomeStandingTeam[] {
  const record = new Map<string, { wins: number; losses: number }>();
  const bump = (name: string | null, won: boolean) => {
    const key = normalizeTeamName(name);
    if (!key) return;
    const entry = record.get(key) ?? { wins: 0, losses: 0 };
    if (won) entry.wins += 1;
    else entry.losses += 1;
    record.set(key, entry);
  };

  for (const fixture of fixtures) {
    if (fixture.season !== season) continue;
    if (fixture.score_a === null || fixture.score_b === null) continue;
    if (fixture.score_a === fixture.score_b) continue; // a series has a winner
    const aWon = fixture.score_a > fixture.score_b;
    bump(fixture.team_a, aWon);
    bump(fixture.team_b, !aWon);
  }

  // Driven by the draft roster rather than by whoever appears in a fixture, so
  // a team that has not played yet still shows at 0-0 instead of vanishing.
  return teams
    .map((team) => {
      const entry = record.get(normalizeTeamName(team.name)) ?? { wins: 0, losses: 0 };
      const played = entry.wins + entry.losses;
      return {
        ...team,
        wins: entry.wins,
        losses: entry.losses,
        winrate_pct: played === 0 ? 0 : Number(((100 * entry.wins) / played).toFixed(1)),
      };
    })
    .sort(
      (a, b) =>
        b.wins - a.wins ||
        a.losses - b.losses ||
        (b.winrate_pct ?? 0) - (a.winrate_pct ?? 0) ||
        a.name.localeCompare(b.name),
    );
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
      .select("season, team_a, team_b, score_a, score_b, stage, sort_order")
      .eq("season", season);
    const fixtures = (fixturesData as StandingsFixture[]) ?? [];
    const standings = deriveSeriesStandings(fixtures, season, scoped).map((team) => ({
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
