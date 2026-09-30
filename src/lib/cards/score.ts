// The legacy card score: how much each of a role's bars, plus winning, is
// worth in the OVR. Split out of build.ts, which re-exports every name here.

import type { MeasureKey } from "./measures";

/**
 * How much each of a role's five bars, plus winning, is worth in the OVR.
 *
 * The card is now scored on exactly what it displays. Before this, the bars
 * came from the measure vocabulary while the number came from POWER_WEIGHTS
 * — nine aggregate fields with no objectives, no turrets, no plates, no
 * laning and no damage share in them. A jungler's card showed an Objectives
 * bar while dragons and barons contributed nothing to their rating, and a
 * top laner's Turrets bar was pure decoration. Reading a card could not tell
 * you why the number was what it was.
 *
 * Every weight below keys a measure in that role's ROLE_BARS, plus `win`.
 * Winning is its own term rather than a bar because it belongs to all five
 * roles equally and is the one thing no per-role measure captures.
 *
 * The weights are judgement, not derivation — they say what the league
 * thinks each role is FOR. Tune them here; nothing else needs to know.
 *
 * WINNING IS WEIGHTED HEAVILY, and that is a correction rather than a
 * preference. Several measures are SHARES of a team's totals — damage share
 * and kill participation feed damage, presence, impact and combat between
 * them — and a share is anti-correlated with winning: a 2-0 stomp spreads
 * kills and damage across five players, while a 0-2 loss concentrates them
 * in whoever kept trying. With winning at 18 the share-driven measures
 * outvoted it, and a mid who lost 0-2 out-rated a mid who won 2-0 on the
 * same week. At 30 the result the game actually produced leads, and the
 * shares say how the player got there.
 */
export type ScoreWeights = { win: number } & Partial<Record<MeasureKey, number>>;

export const ROLE_SCORE_WEIGHTS: Record<string, ScoreWeights> = {
  // Wins lane, takes the map, survives being on an island.
  TOP: { win: 30, combat: 18, laning: 16, turrets: 12, survival: 12, impact: 12 },
  // Objectives are the job. Dragons and barons used to count for nothing.
  JUNGLE: { win: 30, combat: 16, objectives: 18, vision: 10, presence: 14, impact: 12 },
  MIDDLE: { win: 30, combat: 18, damage: 18, laning: 14, presence: 10, impact: 10 },
  // Damage is the reason a bot laner is fed everything the team has.
  BOTTOM: { win: 30, combat: 16, damage: 20, economy: 14, laning: 10, impact: 10 },
  // Vision and presence carry it; damage share barely matters, which is
  // what the old formula got most obviously wrong in the other direction.
  UTILITY: { win: 30, combat: 10, vision: 22, presence: 18, survival: 12, impact: 8 },
};

export const DEFAULT_SCORE_WEIGHTS: ScoreWeights = {
  win: 30,
  combat: 18,
  damage: 18,
  economy: 14,
  vision: 10,
  impact: 10,
};

export function scoreWeightsForRole(roleMode: string | null | undefined): ScoreWeights {
  return (roleMode && ROLE_SCORE_WEIGHTS[roleMode]) || DEFAULT_SCORE_WEIGHTS;
}

/**
 * The card's 0-100 score: the weighted mean of its own bars and its winrate.
 *
 * Every input is already a percentile against the player's ROLE cohort, so
 * the output is on the same 0-100 scale the OVR curve expects and no
 * renormalising is needed. Divided by the weights actually used rather than
 * by 100, so a role whose weights do not sum to 100 still scores on scale.
 */
export function cardScore(
  roleMode: string | null | undefined,
  values: Record<MeasureKey, number>,
  winPctile: number,
): number {
  const weights = scoreWeightsForRole(roleMode);
  let total = 0;
  let used = 0;
  for (const [key, weight] of Object.entries(weights) as [keyof ScoreWeights, number][]) {
    if (!weight) continue;
    const value = key === "win" ? winPctile : values[key as MeasureKey];
    if (typeof value !== "number") continue;
    total += value * weight;
    used += weight;
  }
  // No usable weights would mean a role with no bars at all; the middle is
  // the only honest answer, and it keeps the curve from returning NaN.
  return used > 0 ? total / used : 50;
}
