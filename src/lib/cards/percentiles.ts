// Cohort percentiles for the card engine: the stat columns a card is ranked
// on, and the role-cohort midrank lookup every bar and title reads. Split
// out of build.ts, which re-exports the public names.

import type { PlayerAggRow } from "@/lib/stats/types";
import { playerKey } from "./cardKeys";

/**
 * A counting stat as a RATE, so a long game does not flatter it.
 *
 * Kills, deaths and assists are averaged per GAME, and a 45-minute game
 * simply contains more of all three than a 25-minute one. Percentiling the
 * per-game figure therefore rewards whoever happened to play the longer
 * games that week, which in a two- or three-game window is mostly luck of
 * the draw. Vision never had this problem — it was already per-minute —
 * and this is what gives the rest of the counting stats the same footing.
 *
 * A row with no recorded duration keeps its per-game value: a wrong scale
 * shared by nobody is worse than a right one shared by everyone, but zero
 * would be worse than both.
 */
function perMinute(row: PlayerAggRow, pick: (r: PlayerAggRow) => number): number {
  const minutes = row.avg_game_duration;
  return minutes > 0 ? pick(row) / minutes : pick(row);
}

/** Exported for scripts/inspect-card-cohort.ts, which prints the raw value
 *  each percentile was taken over. */
export const CARD_METRICS = {
  kda: (r: PlayerAggRow) => r.kda,
  avg_dmg_per_min: (r: PlayerAggRow) => r.avg_dmg_per_min,
  avg_dmg_share_pct: (r: PlayerAggRow) => r.avg_dmg_share_pct,
  avg_dmg_taken_per_min: (r: PlayerAggRow) => r.avg_dmg_taken_per_min,
  avg_kills: (r: PlayerAggRow) => r.avg_kills,
  avg_assists: (r: PlayerAggRow) => r.avg_assists,
  avg_deaths: (r: PlayerAggRow) => r.avg_deaths,
  avg_kp_pct: (r: PlayerAggRow) => r.avg_kp_pct,
  avg_cs_per_min: (r: PlayerAggRow) => r.avg_cs_per_min,
  avg_gold_per_min: (r: PlayerAggRow) => r.avg_gold_per_min,
  avg_cs_at_10: (r: PlayerAggRow) => r.avg_cs_at_10,
  avg_gold_at_10: (r: PlayerAggRow) => r.avg_gold_at_10,
  avg_xp_at_10: (r: PlayerAggRow) => r.avg_xp_at_10,
  avg_vision_per_min: (r: PlayerAggRow) => r.avg_vision_per_min,
  avg_solo_kills: (r: PlayerAggRow) => r.avg_solo_kills,
  avg_game_duration: (r: PlayerAggRow) => r.avg_game_duration,
  games: (r: PlayerAggRow) => r.games,
  firstBloodsPerGame: (r: PlayerAggRow) => r.first_blood_involvements / Math.max(r.games, 1),
  platesPerGame: (r: PlayerAggRow) => r.total_plates / Math.max(r.games, 1),
  multiKillsPerGame: (r: PlayerAggRow) => (r.total_doubles + r.total_triples * 2 + r.total_quadras * 3 + r.total_pentas * 4) / Math.max(r.games, 1),
  killsPerMinute: (r: PlayerAggRow) => perMinute(r, (x) => x.avg_kills),
  deathsPerMinute: (r: PlayerAggRow) => perMinute(r, (x) => x.avg_deaths),
  soloKillsPerMinute: (r: PlayerAggRow) => perMinute(r, (x) => x.avg_solo_kills),
  assistsPerMinute: (r: PlayerAggRow) => perMinute(r, (x) => x.avg_assists),
  firstBloodsPerGameOrZero: (r: PlayerAggRow) => (r.games > 0 ? r.first_blood_involvements / r.games : 0),
};

/** Exported for scripts/inspect-card-cohort.ts, which names bar inputs by it. */
export type CardMetric = keyof typeof CARD_METRICS;
/** Exported for scripts/inspect-card-cohort.ts alongside createCardPercentiles. */
export type CardPercentile = (row: PlayerAggRow, metric: CardMetric, invert?: boolean) => number;

/** Midrank preserves tied values, including the single-player rank of zero.
 * Malformed stats retain the comparison behavior of the original scanner. */
function midrankLookup(values: number[]): (value: number) => number {
  const denominator = values.length - 1 || 1;
  if (values.some((value) => typeof value !== "number" || Number.isNaN(value))) {
    return (value) => {
      let below = 0;
      let equal = 0;
      for (const peer of values) {
        if (peer < value) below += 1;
        else if (peer === value) equal += 1;
      }
      return equal ? ((below + (equal - 1) / 2) / denominator) * 100 : 50;
    };
  }
  const sorted = [...values].sort((a, b) => a - b);
  const ranks = new Map<number, number>();
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end] === sorted[start]) end += 1;
    ranks.set(sorted[start], ((start + (end - start - 1) / 2) / denominator) * 100);
    start = end;
  }
  return (value) => ranks.get(value) ?? 50;
}

/** Build role groups once, and index each requested stat once per group.
 * The cache belongs to one build, so refreshed stats cannot reuse old ranks.
 * Exported for scripts/inspect-card-cohort.ts, so the ranks it prints are
 * the ones the cards got rather than a reimplementation of them. */
export function createCardPercentiles(cohort: PlayerAggRow[]): CardPercentile {
  const roles = new Map<string, PlayerAggRow[]>();
  for (const row of cohort) {
    const group = roles.get(row.role_mode);
    if (group) group.push(row);
    else roles.set(row.role_mode, [row]);
  }
  const indexes = new Map<PlayerAggRow[], {
    identities: Set<string>;
    metrics: Map<CardMetric, (value: number) => number>;
  }>();
  return (row, metric, invert = false) => {
    const role = roles.get(row.role_mode);
    const peers = role && role.length >= 4 ? role : cohort;
    let index = indexes.get(peers);
    if (!index) {
      index = { identities: new Set(peers.map(playerKey)), metrics: new Map() };
      indexes.set(peers, index);
    }
    if (!index.identities.has(playerKey(row))) return 50;
    const pick = CARD_METRICS[metric];
    let rank = index.metrics.get(metric);
    if (!rank) {
      rank = midrankLookup(peers.map(pick));
      index.metrics.set(metric, rank);
    }
    const value = rank(pick(row));
    return invert ? 100 - value : value;
  };
}

/** Same-role cohort with the >=4-member fallback formulas.ts uses. */
export function roleCohort(cohort: PlayerAggRow[], row: PlayerAggRow): PlayerAggRow[] {
  const same = cohort.filter((r) => r.role_mode === row.role_mode);
  return same.length >= 4 ? same : cohort;
}
