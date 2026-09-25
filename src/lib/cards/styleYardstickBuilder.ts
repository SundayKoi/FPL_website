// Builds the history a style-rated season is graded against (StyleYardstick,
// src/lib/cards/styleRating.ts). Pure: scripts/build-style-yardstick.ts reads
// raw_stats and writes the result to styleYardsticks.json; the tests feed it
// fixtures. Never imported by the app — the app only reads the file.

import { compareSeasonCodes } from "@/lib/league/season";
import { mondayOf } from "@/lib/packs/week";
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "@/lib/stats/weekly";
import { buildSeasonCards, cardPlayerKey, OVR_BASE, OVR_SCALE, seasonStyleRatings, type CardGameMeta, type CardGameRow } from "./build";
import { championClass, playstyleOf } from "./playstyle";
import {
  farmInputs,
  indexGames,
  MIN_STYLE_GAMES,
  STYLE_LENSES,
  styleStat,
  type FarmInput,
  type GameIndex,
  type StyleStat,
  type StyleYardstick,
} from "./styleRating";

/** A raw_stats row as the generator reads it: what the card engine and the
 *  weekly aggregation both need, plus the season and side. */
export type HistoryRow = CardGameRow & WeeklyRawStatRow & { season: string; team_side?: string | null };

/** Quantiles at every 5th percentile. */
const QUANTILE_POINTS = 21;

/** How many games a style needs before its farm/lane offset is taken at
 *  face value: offset = n/(n+K) x (style mean - role mean). A style seen
 *  a handful of times barely moves anyone's expectations. */
const OFFSET_SHRINK_GAMES = 30;

/** Four significant figures: plenty for grading, and keeps the file small. */
const round = (value: number): number => Number(value.toPrecision(4));

function mean(values: number[]): number {
  return values.reduce((s, v) => s + v, 0) / (values.length || 1);
}

/** Linear-interpolated quantiles (numpy's default) at every 5th percentile. */
export function quantiles(values: number[]): number[] {
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted.length === 0) return [];
  return Array.from({ length: QUANTILE_POINTS }, (_, i) => {
    const position = (i / (QUANTILE_POINTS - 1)) * (sorted.length - 1);
    const low = Math.floor(position);
    const high = Math.ceil(position);
    return round(sorted[low] + (position - low) * (sorted[high] - sorted[low]));
  });
}

const minutesOf = (row: CardGameRow): number => (typeof row.game_duration_min === "number" ? row.game_duration_min : 0);

interface Distributions {
  distributions: StyleYardstick["distributions"];
  offsets: StyleYardstick["offsets"];
  games: number;
}

/** Style distributions and farm/lane offsets from a set of history games. */
export function buildDistributions(rows: CardGameRow[]): Distributions {
  const index = indexGames(rows);
  const groups = new Map<string, { lensOf: keyof typeof STYLE_LENSES; rows: CardGameRow[] }>();
  const add = (key: string, lensOf: keyof typeof STYLE_LENSES, row: CardGameRow) => {
    const group = groups.get(key);
    if (group) group.rows.push(row);
    else groups.set(key, { lensOf, rows: [row] });
  };
  let games = 0;
  for (const row of rows) {
    const role = row.role?.trim().toUpperCase();
    const style = role ? playstyleOf(role, row.champion) : null;
    const cls = championClass(row.champion);
    if (!role || !style || !cls) continue;
    games += 1;
    add(`${role}|${style}`, style, row);
    add(`*|${cls}`, cls, row);
  }

  const distributions: StyleYardstick["distributions"] = {};
  for (const [key, group] of [...groups.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const stats: Partial<Record<StyleStat, number[]>> = {};
    for (const [stat] of STYLE_LENSES[group.lensOf]) {
      const values = group.rows
        .map((row) => styleStat(stat, row, minutesOf(row), index))
        .filter((v): v is number => v !== null);
      if (values.length) stats[stat] = quantiles(values);
    }
    distributions[key] = { games: group.rows.length, stats };
  }
  return { distributions, offsets: farmOffsets(rows, index), games };
}

/** How far each style's typical game sits from its role's on the farm and
 *  lane inputs, shrunk toward zero for styles history has rarely seen. */
function farmOffsets(rows: CardGameRow[], index: GameIndex): StyleYardstick["offsets"] {
  type Figures = Partial<Record<FarmInput, number>>;
  const byRole = new Map<string, { style: string; figures: Figures }[]>();
  for (const row of rows) {
    const role = row.role?.trim().toUpperCase();
    const style = role ? playstyleOf(role, row.champion) : null;
    if (!role || !style) continue;
    const minutes = minutesOf(row);
    const inputs = farmInputs(row, role, index);
    const figures: Figures = {};
    if (minutes > 0) figures.cs = inputs.cs / minutes;
    if (inputs.lane) Object.assign(figures, inputs.lane);
    const list = byRole.get(role);
    if (list) list.push({ style, figures });
    else byRole.set(role, [{ style, figures }]);
  }
  const offsets: StyleYardstick["offsets"] = {};
  for (const [role, list] of [...byRole.entries()].sort(([a], [b]) => a.localeCompare(b))) {
    const styles = [...new Set(list.map((entry) => entry.style))].sort();
    for (const style of styles) {
      const entry: Partial<Record<FarmInput, number>> = {};
      for (const input of ["cs", "csd", "gd", "xpd"] as FarmInput[]) {
        const all = list.map((e) => e.figures[input]).filter((v): v is number => v !== undefined);
        const own = list.filter((e) => e.style === style).map((e) => e.figures[input]).filter((v): v is number => v !== undefined);
        if (!all.length || !own.length) continue;
        entry[input] = round((own.length / (own.length + OFFSET_SHRINK_GAMES)) * (mean(own) - mean(all)));
      }
      offsets[`${role}|${style}`] = entry;
    }
  }
  return offsets;
}

/** One week of history as fetchWeekCards would build it. */
function weekWindows(rows: HistoryRow[]): { cohort: ReturnType<typeof aggregateWeeklyPlayerRows>; gamesByPlayer: Map<string, CardGameRow[]>; gameLog: Map<string, CardGameMeta> }[] {
  const byWeek = new Map<string, HistoryRow[]>();
  for (const row of rows) {
    if (!row.game_date) continue;
    const week = mondayOf(new Date(row.game_date));
    const list = byWeek.get(week);
    if (list) list.push(row);
    else byWeek.set(week, [row]);
  }
  return [...byWeek.entries()]
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([, games]) => {
      const gamesByPlayer = new Map<string, CardGameRow[]>();
      const gameLog = new Map<string, CardGameMeta>();
      for (const game of games) {
        const key = cardPlayerKey(game.summoner_name, game.tag);
        const list = gamesByPlayer.get(key);
        if (list) list.push(game);
        else gamesByPlayer.set(key, [game]);
        const meta = gameLog.get(game.match_id) ?? { durationMin: minutesOf(game), blueTeam: null, redTeam: null };
        if (game.team_side?.toLowerCase() === "blue") meta.blueTeam = game.team_name;
        else if (game.team_side?.toLowerCase() === "red") meta.redTeam = game.team_name;
        gameLog.set(game.match_id, meta);
      }
      return { cohort: aggregateWeeklyPlayerRows(games), gamesByPlayer, gameLog };
    });
}

/**
 * Fits the OVR curve: the scale at which this formula mints as many
 * Master-and-above cards a week as the old one did over the same weeks
 * (then as many Challengers, to break ties), with the base keeping the
 * average card where it was. Every week of each history season is scored
 * against a yardstick built from the OTHER seasons, the way a live season
 * is graded against the ones before it — scoring a season against itself
 * would flatter it.
 */
export function fitCurve(seasons: Map<string, HistoryRow[]>, yardstickWithout: (season: string) => StyleYardstick): { base: number; scale: number } {
  const legacy: number[] = [];
  const scores: number[] = [];
  for (const [season, rows] of seasons) {
    const yardstick = yardstickWithout(season);
    for (const window of weekWindows(rows)) {
      for (const card of buildSeasonCards(window)) legacy.push(card.overall);
      for (const rating of seasonStyleRatings({ ...window, yardstick }).values()) scores.push(rating.score);
    }
  }
  if (!legacy.length || !scores.length) return { base: OVR_BASE, scale: OVR_SCALE };
  const masters = legacy.filter((o) => o >= 89).length;
  const challengers = legacy.filter((o) => o >= 94).length;
  const legacyMean = mean(legacy);
  const scoreMean = mean(scores);
  let best = { base: OVR_BASE, scale: OVR_SCALE, miss: Infinity };
  for (let step = 50; step <= 100; step += 1) {
    const scale = step / 100;
    const base = Math.round((legacyMean - scale * scoreMean) * 100) / 100;
    const ovr = scores.map((s) => Math.max(1, Math.min(99, Math.round(base + s * scale))));
    const miss = Math.abs(ovr.filter((o) => o >= 89).length - masters) * 1000 + Math.abs(ovr.filter((o) => o >= 94).length - challengers);
    if (miss < best.miss) best = { base, scale, miss };
  }
  return { base: best.base, scale: best.scale };
}

export interface YardstickInput {
  league: "premier" | "academy";
  /** The league's own completed seasons' rows, by season. May be empty. */
  own: Map<string, HistoryRow[]>;
  /** Another league's rows, used only where the league's own history is
   *  too thin to grade a style against. */
  borrow?: Map<string, HistoryRow[]>;
}

/** A season's yardstick, from the seasons before it. */
export function buildStyleYardstick({ league, own, borrow = new Map() }: YardstickInput): StyleYardstick {
  const useOwn = [...own.values()].some((rows) => rows.length > 0);
  const seasons = useOwn ? own : borrow;
  const rows = [...seasons.values()].flat();
  const base = buildDistributions(rows);
  const borrowed: string[] = useOwn ? [] : ["all"];

  if (useOwn && borrow.size) {
    const other = buildDistributions([...borrow.values()].flat());
    for (const [key, theirs] of Object.entries(other.distributions)) {
      const ours = base.distributions[key];
      if ((ours?.games ?? 0) < MIN_STYLE_GAMES && theirs.games >= MIN_STYLE_GAMES) {
        base.distributions[key] = theirs;
        borrowed.push(key);
      }
    }
  }

  const names = [...seasons.keys()].sort(compareSeasonCodes);
  const withoutSeason = (season: string): StyleYardstick => {
    const rest = names.length > 1 ? names.filter((name) => name !== season) : names;
    const held = buildDistributions(rest.flatMap((name) => seasons.get(name) ?? []));
    return { league, history: rest, games: held.games, curve: { base: 0, scale: 1 }, distributions: held.distributions, offsets: held.offsets };
  };
  const curve = fitCurve(seasons, withoutSeason);

  return {
    league,
    history: names,
    ...(borrowed.length ? { borrowed } : {}),
    games: base.games,
    curve,
    distributions: base.distributions,
    offsets: base.offsets,
  };
}
