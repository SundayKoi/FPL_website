import { scopeScheduleFixtures } from "@/lib/schedule/scope";
import { hasResult, nextUp, seasonsOf } from "@/lib/schedule/format";
import { compareSeasonsNewestFirst } from "@/lib/stats/queries";
import { seasonBelongsToLeague } from "@/lib/league/season";
import { compareFixtures } from "@/lib/schedule/format";
import type { FixtureRow, FixtureStage } from "@/lib/schedule/types";

export type ScheduleLeague = "premier" | "academy";
export type SchedulePhase = "regular" | "gauntlet" | "playoffs";
export type ScheduleSearchParams = Record<string, string | string[] | undefined>;

export interface ScheduleViewState {
  league: ScheduleLeague;
  season: string | null;
  phase: SchedulePhase;
  week: 1 | 2 | 3 | 4 | 5;
  defaultStage: FixtureStage;
  seasons: string[];
  fixtures: FixtureRow[];
}

const REGULAR_STAGES = ["week_1", "week_2", "week_3", "week_4", "week_5"] as const;
const PLAYOFF_STAGES = ["quarterfinals", "semifinals", "finals"] as const;
const GAUNTLET_STAGES = ["gauntlet_r1", "gauntlet_r2"] as const;
const VALID_PHASES = new Set<SchedulePhase>(["regular", "gauntlet", "playoffs"]);

function first(value: string | string[] | undefined): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function parseWeek(value: string | undefined): 1 | 2 | 3 | 4 | 5 | null {
  if (!value || !/^[1-5]$/.test(value)) return null;
  return Number(value) as 1 | 2 | 3 | 4 | 5;
}

export function fixturesForLeague(rows: FixtureRow[], league: ScheduleLeague): FixtureRow[] {
  return scopeScheduleFixtures(rows, league);
}

function phaseForStage(stage: FixtureStage, league: ScheduleLeague): SchedulePhase {
  if ((REGULAR_STAGES as readonly string[]).includes(stage)) return "regular";
  if ((GAUNTLET_STAGES as readonly string[]).includes(stage) && league === "premier") return "gauntlet";
  return "playoffs";
}

function weekForStage(stage: FixtureStage): 1 | 2 | 3 | 4 | 5 {
  const match = /^week_([1-5])$/.exec(stage);
  return match ? (Number(match[1]) as 1 | 2 | 3 | 4 | 5) : 1;
}

function defaultStageFor(fixtures: FixtureRow[], now: Date): FixtureStage {
  const upcoming = nextUp(fixtures, now);
  if (upcoming && fixtures.some((row) => row.stage === upcoming.stage)) return upcoming.stage;

  const ordered = [...fixtures].sort(compareFixtures);
  const firstUnplayed = ordered.find((row) => !hasResult(row));
  if (firstUnplayed) return firstUnplayed.stage;
  return ordered.at(-1)?.stage ?? "week_1";
}

function defaultRegularWeek(fixtures: FixtureRow[]): 1 | 2 | 3 | 4 | 5 {
  const regular = fixtures.filter((row) => (REGULAR_STAGES as readonly string[]).includes(row.stage));
  for (const stage of REGULAR_STAGES) {
    const rows = regular.filter((row) => row.stage === stage);
    if (rows.length > 0 && rows.some((row) => !hasResult(row))) return weekForStage(stage);
  }
  const latestPopulated = [...REGULAR_STAGES].reverse().find((stage) => regular.some((row) => row.stage === stage));
  return latestPopulated ? weekForStage(latestPopulated) : 1;
}

export function resolveScheduleViewState(
  allRows: FixtureRow[],
  params: ScheduleSearchParams,
  league: ScheduleLeague,
  now = new Date(),
  configuredSeason?: string,
): ScheduleViewState {
  const leagueRows = fixturesForLeague(allRows, league);
  const configured = configuredSeason?.trim();
  const ownedConfigured = configured && seasonBelongsToLeague(configured, league) ? configured : undefined;
  const seasons = Array.from(new Set([
    ...seasonsOf(leagueRows),
    ...(ownedConfigured ? [ownedConfigured] : []),
  ])).sort(compareSeasonsNewestFirst);
  const requestedSeason = first(params.season);
  const season = requestedSeason && seasons.includes(requestedSeason) ? requestedSeason : seasons[0] ?? null;
  const fixtures = season ? leagueRows.filter((row) => row.season === season) : [];
  const defaultStage = defaultStageFor(fixtures, now);
  const requestedPhase = first(params.phase);
  const phaseIsValid = requestedPhase !== undefined && VALID_PHASES.has(requestedPhase as SchedulePhase);
  const academyGauntlet = league === "academy" && requestedPhase === "gauntlet";
  const requestedWeek = parseWeek(first(params.week));

  let phase = phaseForStage(defaultStage, league);
  let week = phase === "regular" ? weekForStage(defaultStage) : defaultRegularWeek(fixtures);

  if (phaseIsValid && !academyGauntlet) {
    phase = requestedPhase as SchedulePhase;
    if (phase === "regular") {
      week = requestedWeek ?? defaultRegularWeek(fixtures);
    }
  } else if (requestedPhase === undefined && requestedWeek !== null) {
    phase = "regular";
    week = requestedWeek;
  }

  return { league, season, phase, week, defaultStage, seasons, fixtures };
}

export function scheduleViewHref(
  pathname: string,
  season: string | null,
  phase: SchedulePhase,
  week?: number,
): string {
  const params = new URLSearchParams();
  if (season) params.set("season", season);
  params.set("phase", phase);
  if (phase === "regular" && week !== undefined) params.set("week", String(week));
  const query = params.toString();
  return query ? `${pathname}?${query}` : pathname;
}

export function stageViewHref(pathname: string, season: string | null, stage: FixtureStage): string {
  const phase = phaseForStage(stage, pathname.startsWith("/academy/") ? "academy" : "premier");
  return phase === "regular"
    ? scheduleViewHref(pathname, season, phase, weekForStage(stage))
    : scheduleViewHref(pathname, season, phase);
}

export function scheduleStages(phase: SchedulePhase, league: ScheduleLeague): readonly FixtureStage[] {
  if (phase === "regular") return REGULAR_STAGES;
  if (phase === "gauntlet") return league === "premier" ? GAUNTLET_STAGES : [];
  return PLAYOFF_STAGES;
}


export function legacyScheduleHashView(
  value: string,
  league: ScheduleLeague,
): { phase: SchedulePhase; week?: 1 | 2 | 3 | 4 | 5 } | null {
  const hash = value.replace(/^#/, "");
  const week = /^week_([1-5])$/.exec(hash);
  if (week) return { phase: "regular", week: Number(week[1]) as 1 | 2 | 3 | 4 | 5 };
  if ((GAUNTLET_STAGES as readonly string[]).includes(hash)) {
    return league === "premier" ? { phase: "gauntlet" } : null;
  }
  if ((PLAYOFF_STAGES as readonly string[]).includes(hash)) return { phase: "playoffs" };
  return null;
}
