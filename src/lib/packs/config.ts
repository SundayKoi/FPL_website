// Tunables for the card-pack economy. Everything the pack odds and pricing
// depend on lives here so a balance pass is a one-file change — the roller
// (rng.ts), the server action (actions.ts) and any UI read these constants
// rather than hardcoding their own.

import type { CardTier } from "@/lib/cards/build";
import { MOMENT_DUST, MOMENT_TIER } from "@/lib/cards/moments";

/** A card tier key, as produced by the rating engine's `tierFor`. */
export type CardTierKey = CardTier["key"];

/** Pack rarity buckets. Eight tiers is too fine a grain to write odds
 *  against (and the top tiers are often empty in a small league), so tiers
 *  collapse into four classes that the weights below are expressed over. */
export type RarityClass = "common" | "rare" | "epic" | "legendary";

/**
 * What one pack costs, in betting dollars. Calibrated against the 1000
 * signup grant (src/lib/betting/wallet.ts): five packs out of the gate, so a
 * new account can build a fantasy lineup on day one without betting first,
 * but not fill a collection.
 */
export const PACK_COST = 200;

/** Cards per pack. */
export const PACK_SIZE = 5;

/** Worst-to-best. The roller walks this when a rolled class has no cards in
 *  the league and it has to fall back to a neighbouring one. */
export const RARITY_ORDER: RarityClass[] = ["common", "rare", "epic", "legendary"];

/** Which bucket each card tier falls into. */
export const RARITY_BY_TIER: Record<CardTierKey, RarityClass> = {
  bronze: "common",
  silver: "common",
  gold: "common",
  platinum: "rare",
  emerald: "rare",
  diamond: "epic",
  master: "legendary",
  challenger: "legendary",
};

/**
 * Per-slot class odds, as relative weights (they happen to sum to 100, but
 * the roller normalizes, so they don't have to).
 *
 * Tuned for "rewarding but rare" (2026-08-23 balance pass, down from
 * 62/24/10/4): a pack averages ~1.25 rare-or-better pulls, a Diamond
 * appears in roughly every 5th pack, and a legendary in ~1 in 20 slots'
 * packs (~5% per pack before the bad-beat guarantee's small tail) — an
 * event, not an expectation. Steeper than this and most packs feel like
 * blanks; flatter and the top of the collection stops meaning anything.
 */
export const RARITY_WEIGHTS: Record<RarityClass, number> = {
  common: 75,
  rare: 20,
  epic: 4,
  legendary: 1,
};

/** Chance any given pulled card comes out foil — a cosmetic variant, rolled
 *  independently of rarity so a foil bronze is a real (if modest) pull. */
export const FOIL_CHANCE = 0.06;

/** Chance a pulled copy prints in an ALTERNATE skin of the player's
 *  signature champion instead of the base splash. Base is the expected
 *  look, so an alternate print reads as a pull in its own right (about
 *  foil-tier); which alternate is uniform across the champion's validated
 *  catalog, so specific skins on big-catalog champions are genuinely hard
 *  to hit. */
export const ALT_SKIN_CHANCE = 0.3;

/**
 * The alternate-art chance on a SIGNED copy. Deliberately below
 * ALT_SKIN_CHANCE: a signed card is already the pull of the month and
 * always prints foil, so "signed + foil + alt art" is the one print that
 * should be genuinely hard to hit — roughly one in seven signed copies
 * rather than one in three. Raise it to ALT_SKIN_CHANCE to make signed
 * copies roll art exactly like every other pull.
 */
export const SIGNED_ALT_SKIN_CHANCE = 0.15;

/**
 * Chance a pulled card comes out autographed — the pen mark of the player
 * themselves, inked onto that copy forever. Only rolls for players who have
 * actually drawn a signature (card_art_prefs.signature), so the real odds
 * are this times however much of the league has signed. Deliberately an
 * order of magnitude below FOIL_CHANCE: a foil is a nice pull, a signed
 * card is the story you tell about the pack you opened.
 */
export const SIGNED_CHANCE = 0.01;

/**
 * Every pack contains at least one card of this class or better. Without it
 * ~24% of packs (0.75^5) would be five commons, which reads as a broken
 * pack rather than a bad roll. Enforced by rng.ts replacing the last slot
 * with a weighted rare-or-better re-roll.
 */
export const GUARANTEED_CLASS: RarityClass = "rare";

/**
 * What a copy is worth when dusted — sold back for betting dollars.
 *
 * Dusting is a floor for duplicates, never an arbitrage loop, and the
 * numbers are set so the arithmetic says so. At the RARITY_WEIGHTS above a
 * single slot dusts for 0.75×10 + 0.20×25 + 0.04×60 + 0.01×150 ≈ $16.4, so
 * a PACK_SIZE of five expects roughly $82 against a PACK_COST of 200 — about
 * 41 cents back on the dollar (a little more once the guaranteed
 * rare-or-better slot and the foil multiplier and autograph bonus are
 * counted, still
 * nowhere near even). Grinding packs to dust therefore burns money; the only
 * thing dusting is good for is turning a fourth copy of the same bronze into
 * something.
 *
 * Push these much higher and packs become a money printer for anyone
 * willing to click; push them to zero and dupes are just litter.
 */
export const DUST_VALUES: Record<RarityClass, number> = {
  common: 10,
  rare: 25,
  epic: 60,
  legendary: 150,
};

/** Foils dust for double — the same premium the pull itself carries. This
 *  is Prisma's multiplier; the rarer parallels scale up from it below. */
export const FOIL_DUST_MULT = 2;

/**
 * Foil parallels, common first.
 *
 * A foil used to be one look, so "I pulled a foil" was the whole story.
 * These four split that into a ladder, rolled INSIDE the existing
 * FOIL_CHANCE — the odds of pulling *a* foil are exactly what they were,
 * and what changes is that a foil is now a specific foil.
 *
 * The ladder deliberately sits on the LUCK axis. Tier says how well
 * somebody played and is earned; foil says how the pack fell. Putting the
 * chase here gives collectors something to hunt without inflating anyone's
 * rating, which is what makes a Bronze Cracked Ice a good object rather
 * than a contradiction.
 *
 * Ordered quiet to loud on purpose. A chase you cannot recognise across a
 * room is a bad chase, so the subtle treatment (Aurora) sits low and the
 * unmistakable one (Cracked Ice) tops out.
 */
export const FOIL_TYPES = ["prisma", "aurora", "refractor", "ice"] as const;
export type FoilType = (typeof FOIL_TYPES)[number];

/** The base, and what every foil minted before parallels existed IS. Never
 *  change this: the migration backfilled real copies to it, and a pulled
 *  card's look is frozen at mint like everything else on it. */
export const DEFAULT_FOIL_TYPE: FoilType = "prisma";

/** Relative weights within a foil pull. Multiply by FOIL_CHANCE for the
 *  real per-card odds: Prisma 3.6%, Aurora 1.5%, Refractor 0.72%, Cracked
 *  Ice 0.18% — roughly one Cracked Ice per 111 packs, which puts it just
 *  past a signature (SIGNED_CHANCE, 1%) as the hardest cosmetic to hit. */
export const FOIL_TYPE_WEIGHTS: Record<FoilType, number> = {
  prisma: 60,
  aurora: 25,
  refractor: 12,
  ice: 3,
};

/**
 * Dust multiplier per parallel, replacing the flat FOIL_DUST_MULT.
 *
 * Kept deliberately shallow. The top of the ladder takes a legendary from
 * 150 to 750, which is a real premium and still under MOMENT_DUST (1000) —
 * moments stay the most valuable thing anyone can hold, and a lucky foil
 * roll never outranks a performance that actually happened.
 */
export const FOIL_TYPE_DUST_MULT: Record<FoilType, number> = {
  prisma: FOIL_DUST_MULT,
  aurora: 2.5,
  refractor: 3,
  ice: 5,
};

/** What the card calls each parallel. */
export const FOIL_TYPE_LABELS: Record<FoilType, string> = {
  prisma: "Prisma",
  aurora: "Aurora",
  refractor: "Refractor",
  ice: "Cracked Ice",
};

/** A stored value narrowed to a FoilType, falling back to the base.
 *  card_inventory.foil_type is plain text, and an unrecognised value must
 *  render and price as an ordinary foil rather than crash a collection. */
export function foilTypeOf(value: string | null | undefined): FoilType {
  return (FOIL_TYPES as readonly string[]).includes(value ?? "")
    ? (value as FoilType)
    : DEFAULT_FOIL_TYPE;
}

/** Weighted pick of a parallel. Consumes exactly one rand. */
export function rollFoilType(rand: () => number): FoilType {
  const total = FOIL_TYPES.reduce((sum, type) => sum + FOIL_TYPE_WEIGHTS[type], 0);
  let ticket = rand() * total;
  for (const type of FOIL_TYPES) {
    ticket -= FOIL_TYPE_WEIGHTS[type];
    if (ticket < 0) return type;
  }
  return DEFAULT_FOIL_TYPE;
}

/**
 * A flat bonus every autographed copy dusts for, ON TOP of the card's own
 * (foil-doubled) value — deliberately a flat add rather than a multiplier.
 *
 * The signature is exactly as rare on a bronze as on a challenger card, so
 * it should dominate the price: at this number the autograph is 80-98% of
 * what a signed copy dusts for, and the tier underneath is a visible but
 * minor bonus. A multiplier said the opposite — that a signed legendary was
 * worth 15× a signed common — which undersold every signed copy of an
 * ordinary player.
 *
 * Sized against the money-printer guardrail, not vibes. A pack costs
 * PACK_COST and returns ~$82 in expected dust; signed copies add roughly
 * 0.05 × (this) per pack when the whole league has drawn a signature, so
 * 1200 lands total expected return near 72% of pack cost at worst. Past
 * ~1500 packs start paying for themselves and dusting becomes an income.
 */
export const SIGNED_DUST_BASE = 1200;

/** The rarity bucket a card tier belongs to. */
export function rarityOf(tier: CardTierKey): RarityClass {
  return RARITY_BY_TIER[tier];
}

/**
 * The dust value of one owned copy: the tier's value, doubled when foil,
 * plus the flat autograph bonus. So a signed foil legendary is
 * 150 × 2 + 1200 = $1,500 and a signed foil bronze is 10 × 2 + 1200 =
 * $1,220 — close together on purpose, because the signature is the rare
 * part and it is equally rare on both.
 *
 * `tier` is typed loosely because it arrives from card_inventory's flat
 * `tier` column (a plain text column, see queries.ts's InventoryRow): an
 * unrecognized tier dusts as common rather than crashing the collection.
 */
export function dustValueOf(row: {
  tier: CardTierKey | string;
  foil: boolean;
  /** Which parallel. Absent on a copy minted before parallels existed,
   *  which prices as Prisma — exactly what it is. */
  foilType?: string | null;
  signed: boolean;
  /** A pulled moment prices flat, off MOMENT_DUST — it has no tier to
   *  scale off, and the placeholder tier it carries would otherwise dust
   *  it as an ordinary card of that rarity. */
  moment?: boolean;
}): number {
  // Either signal is enough: the flat column says "moment" on a stored
  // copy, and the flag covers a caller holding the card json instead.
  if (row.moment || row.tier === MOMENT_TIER) return MOMENT_DUST;
  const rarity = RARITY_BY_TIER[row.tier as CardTierKey] ?? "common";
  let value = DUST_VALUES[rarity];
  // Rounded because the middle of the ladder is fractional (2.5) and dust
  // is a whole-number currency — an un-rounded 62.5 would drift the ledger.
  if (row.foil) value = Math.round(value * FOIL_TYPE_DUST_MULT[foilTypeOf(row.foilType)]);
  if (row.signed) value += SIGNED_DUST_BASE;
  return value;
}

/** Position in RARITY_ORDER — higher is better. */
export function rarityRank(rarity: RarityClass): number {
  return RARITY_ORDER.indexOf(rarity);
}
