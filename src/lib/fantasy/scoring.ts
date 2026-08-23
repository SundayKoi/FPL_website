// Turning a week of real games into a week of fantasy points.
//
// There is no fantasy-specific points formula here on purpose: a lineup's
// score IS the players' Power Ranking over that week's games — the same
// number the homepage's Weekly Standouts are picked by
// (src/lib/stats/weekly.ts + formulas.ts). One rating engine, one answer,
// so a card that wins Standout can't finish behind a teammate in fantasy.
//
// Pure, and framework-free: the caller fetches the week's raw_stats rows and
// hands them in, so this same pair of functions works under a scoring job,
// a test, or a preview render.

import { cardSlug } from "@/lib/cards/build";
import { powerRanking, round1 } from "@/lib/stats/formulas";
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "@/lib/stats/weekly";
import { FANTASY_ROLES, type FantasyRole } from "./config";

/** One fielded card, as it is denormalized into `fantasy_lineups.slots`.
 *  Frozen at submit time: the copy's rating and edition are part of the
 *  entry, so a restat can't retroactively bust a lineup's salary cap. */
export interface StoredSlot {
  inventoryId: number;
  slug: string;
  playerName: string;
  overall: number;
  editionWeek: string;
  foil: boolean;
}

/** The `slots` jsonb: one entry per role. Partial because a hand-written or
 *  legacy row is data, not a promise — the scorer skips what isn't there. */
export type StoredSlots = Partial<Record<FantasyRole, StoredSlot>>;

/** What one slot earned, as written to `fantasy_lineups.breakdown`. */
export interface SlotScore {
  slug: string;
  playerName: string;
  points: number;
}

export type LineupBreakdown = Partial<Record<FantasyRole, SlotScore>>;

/**
 * Every player's Power Ranking over the rows handed in, keyed by card slug.
 *
 * `rows` must already be narrowed to one week (and one league's season) by
 * the caller — this function has no opinion about dates, it just rates
 * whatever cohort it is given. That matters: Power Ranking is
 * cohort-relative, so the rows you pass in define the curve.
 */
export function weeklyScoresBySlug(rows: WeeklyRawStatRow[]): Map<string, number> {
  const scores = new Map<string, number>();
  // powerRanking returns best-first, so the first writer of a slug wins —
  // relevant only in the pathological case of two name#tag pairs slugging
  // the same, where crediting the better line is the friendlier answer.
  for (const player of powerRanking(aggregateWeeklyPlayerRows(rows))) {
    const slug = cardSlug(player.summoner_name, player.tag);
    if (!scores.has(slug)) scores.set(slug, player.score);
  }
  return scores;
}

/**
 * Scores one stored lineup against a week's `weeklyScoresBySlug` map.
 *
 * A player absent from the map didn't play that week and scores 0 rather
 * than being dropped: fielding someone whose team was on bye is a lineup
 * decision the manager made, and the breakdown should show the zero.
 */
export function scoreLineup(
  slots: StoredSlots,
  scores: Map<string, number>,
): { score: number; breakdown: LineupBreakdown } {
  const breakdown: LineupBreakdown = {};
  let total = 0;
  for (const role of FANTASY_ROLES) {
    const slot = slots[role];
    if (!slot) continue;
    const points = round1(scores.get(slot.slug) ?? 0);
    total += points;
    breakdown[role] = { slug: slot.slug, playerName: slot.playerName, points };
  }
  return { score: round1(total), breakdown };
}
