// The card's stat-bar vocabulary and which five bars each role wears.
//
// Split out of build.ts because the assignment is a product decision that
// changes far more often than the rating engine around it, and because
// every measure here is a pure function of rows the engine already has.
//
// Bars are percentiles against the player's own role cohort, so a Support's
// Vision is judged against Supports and never against ADCs.

import type { CardGameRow } from "./build";

export type MeasureKey =
  | "combat"
  | "damage"
  | "economy"
  | "laning"
  | "vision"
  | "objectives"
  | "turrets"
  | "survival"
  | "presence"
  | "impact";

export const MEASURE_LABELS: Record<MeasureKey, string> = {
  combat: "Combat",
  damage: "Damage",
  economy: "Economy",
  laning: "Laning",
  vision: "Vision",
  objectives: "Objectives",
  turrets: "Turrets",
  survival: "Survival",
  presence: "Presence",
  impact: "Impact",
};

/**
 * Five bars per role. Combat leads everywhere so cards stay comparable at a
 * glance, Impact closes everywhere, and the middle three say what the role
 * is actually for. Keyed by raw_stats' role_mode spelling.
 */
export const ROLE_BARS: Record<string, MeasureKey[]> = {
  TOP: ["combat", "laning", "turrets", "survival", "impact"],
  JUNGLE: ["combat", "objectives", "vision", "presence", "impact"],
  MIDDLE: ["combat", "damage", "laning", "presence", "impact"],
  BOTTOM: ["combat", "damage", "economy", "laning", "impact"],
  UTILITY: ["combat", "vision", "presence", "survival", "impact"],
};

/** What a card wears when its role is unknown or unrecorded. */
export const DEFAULT_BARS: MeasureKey[] = ["combat", "damage", "economy", "vision", "impact"];

export function barsForRole(roleMode: string | null | undefined): MeasureKey[] {
  return (roleMode && ROLE_BARS[roleMode]) || DEFAULT_BARS;
}

export interface GameTotals {
  /** Objective takedowns + objective damage per 1k, per minute played. */
  objectives: number;
  /** Turret kills + turret damage per 1k per minute, plus plates per game —
   *  plates live in a fixed 14-minute window and are not a rate. */
  turrets: number;
}

const num = (value: number | null | undefined): number => (typeof value === "number" ? value : 0);

/**
 * Per-minute objective and turret work for one player.
 *
 * Damage is divided by 1000 before being added to takedowns so a single
 * 9000-damage baron doesn't drown out the count of objectives actually
 * taken — the two live on comparable scales this way.
 *
 * Rates, not per-game totals: dragons and barons respawn on timers and
 * turret damage accrues throughout, so a 45-minute game contains more of
 * both than a 25-minute one no matter who was playing. Comparing per-game
 * figures ranked whoever drew the longer games.
 *
 * PLATES ARE THE EXCEPTION and stay per game. Turret plating only exists
 * until 14 minutes, so the window is the same length in every game;
 * dividing by a duration the plates could not use would penalise a player
 * for a long game they had no plates left to take in.
 *
 * `durations` maps match_id to minutes. A game with no recorded duration
 * falls back to counting toward the per-game figure, which is the old
 * behaviour for that game rather than a zero that would erase it.
 */
export function gameTotals(games: CardGameRow[], durations?: Map<string, number>): GameTotals {
  if (games.length === 0) return { objectives: 0, turrets: 0 };
  let objectives = 0;
  let turrets = 0;
  let plates = 0;
  let minutes = 0;
  for (const game of games) {
    objectives += num(game.dragon_kills) + num(game.baron_kills) + num(game.objective_damage) / 1000;
    turrets += num(game.turret_kills) + num(game.turret_damage) / 1000;
    plates += num(game.turret_plates_destroyed);
    minutes += durations?.get(game.match_id) ?? 0;
  }
  // No durations at all (a solo build with no game log) keeps the old
  // per-game scale — every player in that cohort shares it, so the
  // percentiles still rank correctly against each other.
  const divisor = minutes > 0 ? minutes : games.length;
  return {
    objectives: objectives / divisor,
    turrets: turrets / divisor + plates / games.length,
  };
}

/**
 * Percentile (0-100) of `value` within `values` — rank position over cohort
 * size, matching how build.ts's pct() reads a PlayerAggRow field.
 *
 * A cohort of one, or one where everybody ties, returns 50: there is no
 * ranking to report, and handing out 100 would tell the reader a week in
 * which nobody took an objective was a week of five perfect scores.
 */
export function pctOf(values: number[], value: number): number {
  if (values.length <= 1) return 50;
  let below = 0;
  let equal = 0;
  for (const peer of values) {
    if (peer < value) below += 1;
    else if (peer === value) equal += 1;
  }
  if (equal === 0) return 50;
  // Midrank, matching build.ts's pct: ties split their band down the
  // middle. indexOf handed every tied player the BOTTOM of the band, which
  // understated a whole cohort that had done identically well.
  return ((below + (equal - 1) / 2) / (values.length - 1)) * 100;
}
