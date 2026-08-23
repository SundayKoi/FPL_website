// Tunables for the card-pack economy. Everything the pack odds and pricing
// depend on lives here so a balance pass is a one-file change — the roller
// (rng.ts), the server action (actions.ts) and any UI read these constants
// rather than hardcoding their own.

import type { CardTier } from "@/lib/cards/build";

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
 * the roller normalizes, so they don't have to). Deliberately flatter than
 * the underlying tier distribution: pulling a Challenger should feel rare
 * even in a season where several players rate that high.
 */
export const RARITY_WEIGHTS: Record<RarityClass, number> = {
  common: 62,
  rare: 24,
  epic: 10,
  legendary: 4,
};

/** Chance any given pulled card comes out foil — a cosmetic variant, rolled
 *  independently of rarity so a foil bronze is a real (if modest) pull. */
export const FOIL_CHANCE = 0.06;

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
 * ~9% of packs would be five commons, which reads as a broken pack rather
 * than a bad roll. Enforced by rng.ts replacing the last slot.
 */
export const GUARANTEED_CLASS: RarityClass = "rare";

/** The rarity bucket a card tier belongs to. */
export function rarityOf(tier: CardTierKey): RarityClass {
  return RARITY_BY_TIER[tier];
}

/** Position in RARITY_ORDER — higher is better. */
export function rarityRank(rarity: RarityClass): number {
  return RARITY_ORDER.indexOf(rarity);
}
