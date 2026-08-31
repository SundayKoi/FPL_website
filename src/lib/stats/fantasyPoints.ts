// Fantasy points: one game of real stats turned into one number.
//
// This is a DIFFERENT number from the Fantasy mode's lineup scoring
// (src/lib/fantasy/scoring.ts), and deliberately so. That one scores a
// lineup by Power Ranking, which is cohort-relative — your score depends
// on how everyone else played that week. This one is an absolute tariff:
// three points a kill, minus one a death, and so on, so a 12-kill game is
// worth the same on a quiet week as on a loud one. Two questions, two
// answers; the naming keeps them apart everywhere they are shown.
//
// A week's score is the AVERAGE of the games played in it, and the season
// is the SUM of those weekly scores. Volume inside a week buys nothing —
// four games and two games are both one week — while turning up for
// another week earns another score. Getting this backwards was the first
// version of this file.
//
// A NOTE ON UNITS, because it is the one thing that can silently go wrong
// here by a factor of a hundred: the tariff prices damage share and kill
// participation per 1.0 — a 30% damage share is 0.30 — while `raw_stats`
// stores both as percentages (30). The conversion happens once, in
// gamePoints, and is pinned by a test. Feeding the raw column straight in
// would pay 300 points for an ordinary game and nobody would notice
// immediately, because the leaderboard would still be sorted plausibly.

import type { WeeklyRawStatRow } from "./weekly";
import { mondayOf } from "@/lib/packs/week";

/**
 * What each stat is worth. These mirror the league's own point values —
 * change them here and every surface follows, because nothing else in the
 * codebase writes these numbers down.
 */
export interface FantasyTariff {
  kill: number;
  death: number;
  assist: number;
  /** Per CS per minute, per game. */
  csPerMin: number;
  /** Per point of vision score, per game. */
  visionScore: number;
  /** Per 1.0 damage share — so 0.30 of the team's damage pays 0.3x this. */
  damageShare: number;
  /** Per 1.0 kill participation, same scale as damage share. */
  killParticipation: number;
  win: number;
}

export const FANTASY_TARIFF: FantasyTariff = {
  kill: 3,
  death: -1,
  assist: 1.5,
  csPerMin: 0.5,
  visionScore: 0.05,
  damageShare: 10,
  killParticipation: 5,
  win: 5,
};

/** The rows this module scores — a subset of WeeklyRawStatRow, so the
 *  existing fetchers and column lists already cover it. */
export type FantasyStatRow = Pick<
  WeeklyRawStatRow,
  | "assists"
  | "cs_per_min"
  | "damage_share_pct"
  | "deaths"
  | "game_date"
  | "kill_participation_pct"
  | "kills"
  | "summoner_name"
  | "tag"
  | "vision_score"
  | "win"
>;

const num = (value: number | null | undefined): number => (typeof value === "number" && Number.isFinite(value) ? value : 0);

/** Percent column to the 0–1 scale the tariff prices. */
const asShare = (pct: number | null | undefined): number => num(pct) / 100;

/** Two decimals — points are displayed, compared and summed, and a long
 *  float tail in a table is noise that also makes two equal scores look
 *  unequal. */
export const round2 = (value: number): number => Math.round(value * 100) / 100;

/**
 * One game's points. Pure, and forgiving of nulls: a row missing a column
 * scores zero for that line rather than poisoning the total with NaN — an
 * ingest that dropped vision score should cost the vision points, not the
 * whole game.
 */
export function gamePoints(row: FantasyStatRow, tariff: FantasyTariff = FANTASY_TARIFF): number {
  return round2(
    num(row.kills) * tariff.kill +
      num(row.deaths) * tariff.death +
      num(row.assists) * tariff.assist +
      num(row.cs_per_min) * tariff.csPerMin +
      num(row.vision_score) * tariff.visionScore +
      asShare(row.damage_share_pct) * tariff.damageShare +
      asShare(row.kill_participation_pct) * tariff.killParticipation +
      (row.win === true ? tariff.win : 0),
  );
}

/** One week of a player's season: the AVERAGE of the games they played
 *  in it, plus what that average was taken over. */
export interface FantasyWeekScore {
  /** Monday of the week, Eastern. */
  week: string;
  /** The week's score — the mean of its games, not their sum. */
  points: number;
  games: number;
  wins: number;
}

export interface FantasyPlayer {
  summonerName: string;
  tag: string;
  /** "name#tag" — the key the table sorts by. */
  key: string;
  games: number;
  wins: number;
  /** Every week they played, newest first. */
  weeks: FantasyWeekScore[];
  byWeek: Map<string, FantasyWeekScore>;
  /** The season total: the sum of the weekly scores above. Playing more
   *  WEEKS earns more; playing more games inside one week does not. */
  points: number;
  /** The season total over the weeks it was earned in — the fair
   *  comparison when people have missed different weeks. */
  perWeek: number;
}

/** The identity a raw row belongs to. Name and tag together: two players
 *  can share a summoner name across regions. */
export function fantasyKey(row: Pick<FantasyStatRow, "summoner_name" | "tag">): string {
  return `${row.summoner_name ?? ""}#${row.tag ?? ""}`;
}

/** The Monday a game belongs to, on the same Eastern calendar every other
 *  weekly thing in the codebase keeps (packs, the daily rip, the drop). */
export function weekOf(row: Pick<FantasyStatRow, "game_date">): string | null {
  if (!row.game_date) return null;
  const date = new Date(row.game_date);
  return Number.isNaN(date.getTime()) ? null : mondayOf(date);
}

/**
 * Every player's fantasy season, from raw rows.
 *
 * A WEEK is scored as the mean of the games played in it, so a player who
 * turned up for four games is not ahead of one who won twice purely on
 * volume. The SEASON is the sum of those weekly scores, which is the
 * accumulation the tariff is actually for: showing up for another week
 * earns another score, showing up twice in one week does not.
 *
 * A row with no usable game_date belongs to no week and is dropped
 * entirely rather than being scored into a total it cannot be averaged
 * into — leaving it in would make `games` disagree with `points`, and a
 * table whose columns contradict each other is worse than one missing a
 * row. In practice every ingested row carries a date.
 */
export function fantasySeason(rows: FantasyStatRow[], tariff: FantasyTariff = FANTASY_TARIFF): FantasyPlayer[] {
  /** key -> week -> the games in it. */
  const tally = new Map<string, { name: string; tag: string; weeks: Map<string, { points: number; games: number; wins: number }> }>();

  for (const row of rows) {
    // A row with no name cannot be attributed to anyone; counting it under
    // "#" would invent a player the league does not have.
    if (!row.summoner_name) continue;
    const week = weekOf(row);
    if (!week) continue;
    const key = fantasyKey(row);
    let player = tally.get(key);
    if (!player) {
      player = { name: row.summoner_name, tag: row.tag ?? "", weeks: new Map() };
      tally.set(key, player);
    }
    const bucket = player.weeks.get(week) ?? { points: 0, games: 0, wins: 0 };
    bucket.points += gamePoints(row, tariff);
    bucket.games += 1;
    if (row.win === true) bucket.wins += 1;
    player.weeks.set(week, bucket);
  }

  const players: FantasyPlayer[] = [];
  for (const [key, entry] of tally) {
    const weeks: FantasyWeekScore[] = [...entry.weeks.entries()]
      .map(([week, bucket]) => ({
        week,
        // THE rule: the week's score is the average of its games.
        points: round2(bucket.points / bucket.games),
        games: bucket.games,
        wins: bucket.wins,
      }))
      .sort((a, b) => b.week.localeCompare(a.week));
    const points = round2(weeks.reduce((sum, week) => sum + week.points, 0));
    players.push({
      summonerName: entry.name,
      tag: entry.tag,
      key,
      games: weeks.reduce((sum, week) => sum + week.games, 0),
      wins: weeks.reduce((sum, week) => sum + week.wins, 0),
      weeks,
      byWeek: new Map(weeks.map((week) => [week.week, week])),
      points,
      perWeek: weeks.length > 0 ? round2(points / weeks.length) : 0,
    });
  }
  return players.sort((a, b) => b.points - a.points || a.key.localeCompare(b.key));
}

/** Every week present in the rows, newest first — the week picker's list. */
export function weeksIn(rows: FantasyStatRow[]): string[] {
  const weeks = new Set<string>();
  for (const row of rows) {
    const week = weekOf(row);
    if (week) weeks.add(week);
  }
  return [...weeks].sort().reverse();
}

/** One week's table: everyone who played it, on that week's score alone.
 *  Derived from the season rather than re-scored, so the weekly view and
 *  the season total can never disagree about a game. */
export function fantasyWeek(players: FantasyPlayer[], week: string): (FantasyPlayer & { weekScore: FantasyWeekScore })[] {
  return players
    .flatMap((player) => {
      const score = player.byWeek.get(week);
      return score ? [{ ...player, weekScore: score }] : [];
    })
    .sort((a, b) => b.weekScore.points - a.weekScore.points || a.key.localeCompare(b.key));
}
