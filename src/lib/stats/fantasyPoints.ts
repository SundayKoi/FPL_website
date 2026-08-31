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

/** What one game contributed, for the per-game breakdown a player row
 *  expands into. */
export interface FantasyLine {
  /** Monday of the game's week, or null on a row with no date. */
  week: string | null;
  points: number;
  win: boolean;
}

export interface FantasyPlayer {
  summonerName: string;
  tag: string;
  /** "name#tag" — the key the table sorts and the compare drawer uses. */
  key: string;
  games: number;
  wins: number;
  /** Every game this season, newest first. */
  lines: FantasyLine[];
  /** Season total. */
  points: number;
  /** Points per game — the fair comparison when people have played
   *  different numbers of games, which in a league with byes is everyone. */
  perGame: number;
  /** Monday -> points, for the weekly view and the sparkline. */
  byWeek: Map<string, number>;
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
 * Rows may span any range the caller fetched; grouping is by player, and
 * the weekly split is derived per row rather than assumed, so one call
 * answers both "this week" and "all season".
 */
export function fantasySeason(rows: FantasyStatRow[], tariff: FantasyTariff = FANTASY_TARIFF): FantasyPlayer[] {
  const players = new Map<string, FantasyPlayer>();
  for (const row of rows) {
    // A row with no name cannot be attributed to anyone; counting it under
    // "#" would invent a player the league does not have.
    if (!row.summoner_name) continue;
    const key = fantasyKey(row);
    let player = players.get(key);
    if (!player) {
      player = {
        summonerName: row.summoner_name,
        tag: row.tag ?? "",
        key,
        games: 0,
        wins: 0,
        lines: [],
        points: 0,
        perGame: 0,
        byWeek: new Map(),
      };
      players.set(key, player);
    }
    const points = gamePoints(row, tariff);
    const week = weekOf(row);
    player.games += 1;
    if (row.win === true) player.wins += 1;
    player.lines.push({ week, points, win: row.win === true });
    player.points = round2(player.points + points);
    if (week) player.byWeek.set(week, round2((player.byWeek.get(week) ?? 0) + points));
  }

  for (const player of players.values()) {
    player.perGame = player.games > 0 ? round2(player.points / player.games) : 0;
  }
  return [...players.values()].sort((a, b) => b.points - a.points || a.key.localeCompare(b.key));
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

/** The same players scored over ONE week only, ranked. Derived from the
 *  season rather than re-scored, so a weekly table and the season table can
 *  never disagree about a game. */
export function fantasyWeek(players: FantasyPlayer[], week: string): FantasyPlayer[] {
  return players
    .filter((player) => player.byWeek.has(week))
    .map((player) => {
      const lines = player.lines.filter((line) => line.week === week);
      const points = player.byWeek.get(week) ?? 0;
      return {
        ...player,
        games: lines.length,
        wins: lines.filter((line) => line.win).length,
        lines,
        points,
        perGame: lines.length > 0 ? round2(points / lines.length) : 0,
      };
    })
    .sort((a, b) => b.points - a.points || a.key.localeCompare(b.key));
}
