// The league's expedition of the week: one shared goal per (season,
// Eastern week) that every collector's claimed runs walk toward together.
// Pure, like config.ts, so the page, the sweep and the panel derive the
// same goal from the same inputs. Spec §3 of
// docs/superpowers/specs/2026-09-23-expeditions-next-level-design.md.
//
// Nothing here is configured. The week decides the kind — weeks alternate
// between a LANDMARK the league walks to on trail miles and a BOSS it
// wears down with pushes at forks — the size is one constant per kind,
// and the name comes off the week's first fixture. The database keeps only
// what is state (20261028000001): the goal that fell, and who was paid.
//
// A goal belongs to ONE league's season. Premier and Academy keep separate
// season labels, every run and every fixture carries one, and every
// function here filters on it: nothing one league walks counts toward the
// other's week.

import { lastCompletedWeekMonday, mondayOf } from "@/lib/packs/week";

/** A landmark stands this many trail miles away (a Scouting Run walks 1,
 *  a Mythic route 5 — trail.ts). The SQL only bounds it (10–1000). */
export const LANDMARK_MILES = 40;
/** A boss falls after this many pushes at forks, league-wide. */
export const BOSS_HEALTH = 24;
/** What each contributor is paid when a goal falls — fixed in the RPC. */
export const LEAGUE_GOAL_FRAGMENTS = 1;
/** How many contributors the panel names. */
export const LEAGUE_LEADERS = 5;

export type LeagueGoalKind = "landmark" | "boss";

export interface LeagueGoal {
  season: string;
  /** The Eastern Monday, YYYY-MM-DD. */
  weekStart: string;
  kind: LeagueGoalKind;
  title: string;
  target: number;
  /** What counts toward it: trail miles for a landmark, pushes for a boss. */
  unit: "miles" | "pushes";
  /** What it is, in plain words. */
  blurb: string;
}

/** A fixture as the goal reads it. `season` is optional so the page's
 *  already season-filtered reads can pass rows without it. */
export interface LeagueFixture {
  team_a: string | null;
  team_b: string | null;
  scheduled_at: string | null;
  season?: string | null;
}

/** One collector's week, from the expedition_league_progress view. */
export interface LeagueProgressRow {
  season: string;
  weekStart: string;
  discordId: string;
  username: string;
  miles: number;
  pushes: number;
}

export interface LeagueReward {
  discordId: string;
  fragments: number;
  top: boolean;
}

/** A goal that fell (expedition_league_goals), with who was paid. */
export interface LeagueGoalRecord {
  season: string;
  weekStart: string;
  kind: LeagueGoalKind;
  target: number;
  fellAt: string;
  /** The Vanguard: whoever had done the most when it fell. */
  topId: string | null;
  rewards: LeagueReward[];
}

export const CAIRN_TITLE = "The Cairn of the Week";

const DAY_MS = 24 * 60 * 60 * 1000;
const WEEK_MS = 7 * DAY_MS;

/** FNV-1a, the weather's week hash. */
function hashKey(key: string): number {
  let hash = 2166136261;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** Consecutive Mondays are consecutive integers. Read at noon UTC so a
 *  date string never lands on a boundary. */
function weekIndex(weekStart: string): number {
  return Math.floor(Date.parse(`${weekStart}T12:00:00Z`) / WEEK_MS);
}

/** The week's kind. It alternates every week, so there is always a
 *  "next week is a boss" to say; the season's hash sets which comes first,
 *  so the two leagues need not march in step. */
export function goalKindFor(season: string, weekStart: string): LeagueGoalKind {
  return (weekIndex(weekStart) + (hashKey(season) & 1)) % 2 === 0 ? "landmark" : "boss";
}

/** The size of a kind of goal. */
export function targetFor(kind: LeagueGoalKind): number {
  return kind === "landmark" ? LANDMARK_MILES : BOSS_HEALTH;
}

function teamName(name: string | null | undefined): string | null {
  const trimmed = (name ?? "").trim();
  if (!trimmed) return null;
  // "The Lions" would otherwise make "The The Lions Colossus".
  return trimmed.replace(/^the\s+/i, "") || trimmed;
}

/** This season's fixtures in this Eastern week, first first. A row that
 *  names another season is another league's match and never themes this
 *  one's goal. */
export function weekFixtures(season: string, weekStart: string, fixtures: LeagueFixture[]): LeagueFixture[] {
  return fixtures
    .filter((fixture) => fixture.scheduled_at && !Number.isNaN(Date.parse(fixture.scheduled_at)))
    .filter((fixture) => fixture.season === undefined || fixture.season === null || fixture.season === season)
    .filter((fixture) => mondayOf(new Date(fixture.scheduled_at!)) === weekStart)
    .sort(
      (a, b) =>
        Date.parse(a.scheduled_at!) - Date.parse(b.scheduled_at!) ||
        (a.team_a ?? "").localeCompare(b.team_a ?? "") ||
        (a.team_b ?? "").localeCompare(b.team_b ?? ""),
    );
}

/** The goal a kind and size make, named off the week's first fixture with
 *  both teams known. A goal that already fell keeps the kind and size it
 *  fell with, whatever the constants say now. */
export function describeGoal(
  season: string,
  weekStart: string,
  kind: LeagueGoalKind,
  target: number,
  fixtures: LeagueFixture[],
): LeagueGoal {
  const first = weekFixtures(season, weekStart, fixtures).find((fixture) => teamName(fixture.team_a) && teamName(fixture.team_b));
  const a = first ? teamName(first.team_a) : null;
  const b = first ? teamName(first.team_b) : null;
  const title = a && b ? (kind === "landmark" ? `The ${a}–${b} Ridge` : `The ${b} Colossus`) : CAIRN_TITLE;
  const blurb =
    kind === "landmark"
      ? `A landmark ${target} miles out. The league walks there together: every mile of every run launched this week counts once the squad is home.`
      : `A boss with ${target} health. The league brings it down together: every push at a fork, on any run launched this week, takes one off once the squad is home.`;
  return { season, weekStart, kind, title, target, unit: kind === "landmark" ? "miles" : "pushes", blurb };
}

/** The week's goal, derived from nothing but the season, the Monday and
 *  the calendar. */
export function leagueGoalFor(season: string, weekStart: string, fixtures: LeagueFixture[]): LeagueGoal {
  const kind = goalKindFor(season, weekStart);
  return describeGoal(season, weekStart, kind, targetFor(kind), fixtures);
}

/** The two weeks with a goal still open: this one, and last — a run that
 *  left last week still counts when it comes home, until this week ends. */
export function weeksToWatch(now: Date): [string, string] {
  return [mondayOf(now), lastCompletedWeekMonday(now)];
}

/** What a collector put toward a kind of goal. */
export function statOf(row: Pick<LeagueProgressRow, "miles" | "pushes">, kind: LeagueGoalKind): number {
  const value = kind === "landmark" ? row.miles : row.pushes;
  return Number.isFinite(value) && value > 0 ? value : 0;
}

export interface LeagueContributor {
  discordId: string;
  username: string;
  stat: number;
}

/** Everyone who put at least one mile (or push) toward this goal, most
 *  first, ties to the lower discord id in code-unit order — the pick
 *  fell_expedition_league_goal makes (collate "C"), so the leader shown is
 *  the Vanguard named. Only this goal's season and week are read. */
export function contributorsOf(goal: Pick<LeagueGoal, "season" | "weekStart" | "kind">, rows: LeagueProgressRow[]): LeagueContributor[] {
  return rows
    .filter((row) => row.season === goal.season && row.weekStart === goal.weekStart)
    .map((row) => ({ discordId: row.discordId, username: row.username, stat: statOf(row, goal.kind) }))
    .filter((row) => row.stat > 0)
    .sort((a, b) => b.stat - a.stat || (a.discordId < b.discordId ? -1 : a.discordId > b.discordId ? 1 : 0));
}

export interface GoalProgress {
  total: number;
  target: number;
  /** Left to walk (or push); zero once reached. */
  remaining: number;
  /** 0–1, for the bar. */
  fraction: number;
  /** How many collectors have put something in. */
  collectors: number;
  reached: boolean;
}

export function goalProgress(goal: Pick<LeagueGoal, "season" | "weekStart" | "kind" | "target">, rows: LeagueProgressRow[]): GoalProgress {
  const contributors = contributorsOf(goal, rows);
  const total = contributors.reduce((sum, row) => sum + row.stat, 0);
  const target = Math.max(1, goal.target);
  return {
    total,
    target: goal.target,
    remaining: Math.max(0, goal.target - total),
    fraction: Math.min(1, total / target),
    collectors: contributors.length,
    reached: total >= goal.target,
  };
}

export interface MyShare {
  stat: number;
  /** 1-based among contributors; null when the viewer has put nothing in. */
  rank: number | null;
  /** How many contributors there are. */
  of: number;
}

/** The viewer's part in this goal, or null when nobody is signed in. */
export function myShare(goal: Pick<LeagueGoal, "season" | "weekStart" | "kind">, rows: LeagueProgressRow[], me: string | null): MyShare | null {
  if (!me) return null;
  const contributors = contributorsOf(goal, rows);
  const index = contributors.findIndex((row) => row.discordId === me);
  return {
    stat: index >= 0 ? contributors[index].stat : 0,
    rank: index >= 0 ? index + 1 : null,
    of: contributors.length,
  };
}

// === the board's view of the league ==========================================

export interface LeagueFall {
  at: string;
  vanguard: { discordId: string; username: string } | null;
  /** Collectors paid a fragment; 0 when the rewards could not be read. */
  rewarded: number;
  /** Whether the viewer was one of them. */
  mine: boolean;
}

export interface LeagueWeek {
  goal: LeagueGoal;
  progress: GoalProgress;
  leaders: LeagueContributor[];
  me: MyShare | null;
  fell: LeagueFall | null;
}

export interface LeagueBoard {
  season: string;
  thisWeek: LeagueWeek;
  /** Last week's goal while it still matters: it fell (its Vanguard is
   *  this week's chip), or it is still open and someone has walked. */
  lastWeek: LeagueWeek | null;
}

/**
 * Everything the panel and the This-week line show, from the three reads
 * (queries.ts). Null — the feature hidden — when either league read failed,
 * which is how an environment without 20261028000001 renders.
 */
export function leagueBoardFor({
  season,
  now,
  fixtures,
  progress,
  goals,
  viewerId,
}: {
  season: string | null;
  now: Date;
  fixtures: LeagueFixture[];
  progress: LeagueProgressRow[] | null;
  goals: LeagueGoalRecord[] | null;
  viewerId: string | null;
}): LeagueBoard | null {
  if (!season || progress === null || goals === null) return null;
  const [thisMonday, lastMonday] = weeksToWatch(now);
  const rows = progress.filter((row) => row.season === season);
  const week = (weekStart: string): LeagueWeek => {
    const record = goals.find((goal) => goal.season === season && goal.weekStart === weekStart) ?? null;
    const goal = record
      ? describeGoal(season, weekStart, record.kind, record.target, fixtures)
      : leagueGoalFor(season, weekStart, fixtures);
    const nameOf = (discordId: string) =>
      rows.find((row) => row.discordId === discordId && row.weekStart === weekStart)?.username ??
      rows.find((row) => row.discordId === discordId)?.username ??
      "A collector";
    return {
      goal,
      progress: goalProgress(goal, rows),
      leaders: contributorsOf(goal, rows).slice(0, LEAGUE_LEADERS),
      me: myShare(goal, rows, viewerId),
      fell: record
        ? {
            at: record.fellAt,
            vanguard: record.topId ? { discordId: record.topId, username: nameOf(record.topId) } : null,
            rewarded: record.rewards.length,
            mine: viewerId !== null && record.rewards.some((reward) => reward.discordId === viewerId),
          }
        : null,
    };
  };
  const last = week(lastMonday);
  return {
    season,
    thisWeek: week(thisMonday),
    lastWeek: last.fell || last.progress.total > 0 ? last : null,
  };
}

// === words ====================================================================

/** "1 mile" / "31 miles" / "1 push" / "18 pushes". */
export function unitCount(n: number, unit: LeagueGoal["unit"]): string {
  if (unit === "miles") return `${n} mile${n === 1 ? "" : "s"}`;
  return `${n} push${n === 1 ? "" : "es"}`;
}

/** "walked" / "landed". */
export function unitVerb(unit: LeagueGoal["unit"]): string {
  return unit === "miles" ? "walked" : "landed";
}

/** "31 of 40 miles walked by 12 collectors this week". */
export function progressLine(week: Pick<LeagueWeek, "goal" | "progress">, when = "this week"): string {
  const { goal, progress } = week;
  const who = progress.collectors === 1 ? "1 collector" : `${progress.collectors} collectors`;
  return `${progress.total} of ${unitCount(goal.target, goal.unit)} ${unitVerb(goal.unit)} by ${who} ${when}`;
}

/** The Eastern weekday of an instant: "Thursday". */
export function easternWeekday(at: string): string {
  return new Date(at).toLocaleDateString("en-US", { weekday: "long", timeZone: "America/New_York" });
}

/** "reached" for a landmark, "brought down" for a boss. */
export function fellVerb(kind: LeagueGoalKind): string {
  return kind === "landmark" ? "reached" : "brought down";
}

/** 1 → "1st", 2 → "2nd", 12 → "12th". */
export function ordinal(n: number): string {
  const tens = n % 100;
  if (tens >= 11 && tens <= 13) return `${n}th`;
  switch (n % 10) {
    case 1:
      return `${n}st`;
    case 2:
      return `${n}nd`;
    case 3:
      return `${n}rd`;
    default:
      return `${n}th`;
  }
}
