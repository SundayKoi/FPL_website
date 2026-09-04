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
import { MUTATION_EFFECTS, type MutationKey } from "@/lib/cards/mutations";
import { powerRanking, round1 } from "@/lib/stats/formulas";
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "@/lib/stats/weekly";
import { FANTASY_ROLES, type FantasyRole } from "./config";

/** One fielded card, as it is denormalized into `fantasy_lineups.slots`.
 *  Frozen at submit time: the copy's rating and edition are part of the
 *  entry, so a restat can't retroactively bust a lineup's salary cap.
 *
 *  `slug` is frozen too, and that part is a snapshot of an IDENTITY rather
 *  than of a valuation — which is why scoring must not trust it. See
 *  currentIdentity below. */
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
  /** The mutation that changed the points, when one did — so the card
   *  back can say why a 70 scored 77, or 0. */
  mutation?: MutationKey;
  /** An Irradiated card that flared out this week. */
  flared?: boolean;
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

/** A card copy's identity as it stands NOW, keyed by card_inventory id.
 *  The caller reads it from card_inventory, which a rename updates. */
export interface CurrentIdentity {
  slug: string;
  playerName: string;
  /** The expedition mutation the copy wears NOW. Read live like the slug:
   *  a mutation is a permanent fact about the copy, not about the week it
   *  was fielded, and an Exorcism between filing and scoring should count. */
  mutation?: MutationKey | null;
}

/**
 * The slug to score a slot under, and the name to print beside it.
 *
 * A slot's stored slug is whatever the player was called on the day the
 * lineup was filed. `weeklyScoresBySlug` keys on the slug derived from
 * raw_stats as it reads TODAY. A Riot rename moves the second and not the
 * first, and then the two never meet: the lineup's slot scores 0 because
 * nothing in the map answers to the old slug, and the renamed player's real
 * points sit in the map unclaimed because no lineup asks for the new one.
 * That is not a hypothetical — Imperialarcher#ezpz became Archêr#ezpz and
 * every lineup that had fielded him took a zero for the week.
 *
 * The card copy is the stable thing. inventoryId does not change when a
 * player is renamed, and card_inventory.slug is updated by the rename, so
 * resolving through it makes every future rename invisible to scoring.
 * Falls back to the stored values when the copy is gone (dusted, or a
 * hand-written row), because a missing lookup should cost nothing more than
 * the old behaviour.
 */
export function currentIdentity(
  slot: StoredSlot,
  identities?: Map<number, CurrentIdentity>,
): CurrentIdentity {
  return identities?.get(slot.inventoryId) ?? { slug: slot.slug, playerName: slot.playerName };
}

/**
 * Scores one stored lineup against a week's `weeklyScoresBySlug` map.
 *
 * A player absent from the map didn't play that week and scores 0 rather
 * than being dropped: fielding someone whose team was on bye is a lineup
 * decision the manager made, and the breakdown should show the zero.
 *
 * `identities` is the live card_inventory identity per inventory id. Pass it
 * so renames resolve; omit it and scoring falls back to the frozen slugs,
 * which is what every caller did before renames were handled.
 */
export function scoreLineup(
  slots: StoredSlots,
  scores: Map<string, number>,
  identities?: Map<number, CurrentIdentity>,
  /** The week being scored ("2026-08-31"): what an Irradiated flare is
   *  drawn against, so the same copy flares the same way on a re-run. */
  week?: string,
): { score: number; breakdown: LineupBreakdown } {
  const breakdown: LineupBreakdown = {};
  let total = 0;
  for (const role of FANTASY_ROLES) {
    const slot = slots[role];
    if (!slot) continue;
    const identity = currentIdentity(slot, identities);
    const raw = scores.get(identity.slug) ?? 0;
    const mutation = identity.mutation ?? null;
    const effect = mutation ? MUTATION_EFFECTS[mutation] : null;
    const flared = Boolean(effect && effect.flareChance > 0 && flares(slot.inventoryId, week ?? "", effect.flareChance));
    const points = flared ? 0 : round1(raw * (effect?.fantasyMult ?? 1));
    total += points;
    // The breakdown prints the CURRENT name too: a manager reading last
    // week's card back should see the player as they are called now, not a
    // name that no longer exists anywhere else on the site.
    breakdown[role] = {
      slug: identity.slug,
      playerName: identity.playerName,
      points,
      ...(mutation ? { mutation } : {}),
      ...(flared ? { flared: true } : {}),
    };
  }
  return { score: round1(total), breakdown };
}

/**
 * Whether an Irradiated copy flares out this week. Deterministic from the
 * copy and the week rather than rolled: the scoring job can run twice (a
 * dry run, then the real one) and a card that scored zero in one must
 * score zero in the other. FNV-1a over "id:week", then a slice of it as a
 * fraction of one.
 */
export function flares(inventoryId: number, week: string, chance: number): boolean {
  let hash = 0x811c9dc5;
  for (const char of `${inventoryId}:${week}`) {
    hash ^= char.charCodeAt(0);
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return (hash % 10_000) / 10_000 < chance;
}

/** Every card_inventory id a set of lineups fielded — what the scoring job
 *  needs to look up before it can resolve identities. */
export function inventoryIdsIn(lineups: { slots: StoredSlots }[]): number[] {
  const ids = new Set<number>();
  for (const lineup of lineups) {
    for (const role of FANTASY_ROLES) {
      const slot = lineup.slots[role];
      if (slot && Number.isInteger(slot.inventoryId)) ids.add(slot.inventoryId);
    }
  }
  return [...ids];
}
