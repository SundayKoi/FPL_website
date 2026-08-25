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
  /** Objective takedowns + objective damage per 1k, averaged per game. */
  objectives: number;
  /** Turret kills + turret damage per 1k + plates, averaged per game. */
  turrets: number;
}

const num = (value: number | null | undefined): number => (typeof value === "number" ? value : 0);

/**
 * Per-game objective and turret work for one player.
 *
 * Damage is divided by 1000 before being added to takedowns so a single
 * 9000-damage baron doesn't drown out the count of objectives actually
 * taken — the two live on comparable scales this way.
 */
export function gameTotals(games: CardGameRow[]): GameTotals {
  if (games.length === 0) return { objectives: 0, turrets: 0 };
  let objectives = 0;
  let turrets = 0;
  for (const game of games) {
    objectives += num(game.dragon_kills) + num(game.baron_kills) + num(game.objective_damage) / 1000;
    turrets += num(game.turret_kills) + num(game.turret_damage) / 1000 + num(game.turret_plates_destroyed);
  }
  return { objectives: objectives / games.length, turrets: turrets / games.length };
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
  const sorted = [...values].sort((a, b) => a - b);
  if (sorted[0] === sorted[sorted.length - 1]) return 50;
  const index = sorted.indexOf(value);
  if (index === -1) return 50;
  return (index / (sorted.length - 1)) * 100;
}
