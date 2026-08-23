// The pack roller. Pure and deterministic given an injected `rand`, so the
// odds are testable (rng.test.ts scripts rand with a queue) and a future
// server-seeded/provably-fair roll is a drop-in — nothing here reaches for
// Math.random itself; actions.ts passes it in.
//
// Cards have no table of their own (they're recomputed from season stats on
// every request — see src/lib/cards/queries.ts), so the "pool" a pack draws
// from is simply the league's current card list handed to rollPack.

import type { PlayerCardData } from "@/lib/cards/build";
import {
  GUARANTEED_CLASS,
  FOIL_CHANCE,
  PACK_SIZE,
  RARITY_ORDER,
  RARITY_WEIGHTS,
  rarityOf,
  rarityRank,
  type RarityClass,
} from "./config";

/** One pulled card. `foil` is cosmetic — rolled independently of rarity. */
export interface PackPull {
  card: PlayerCardData;
  foil: boolean;
}

type Pool = Map<RarityClass, PlayerCardData[]>;

function groupByRarity(cards: PlayerCardData[]): Pool {
  const pool: Pool = new Map(RARITY_ORDER.map((rarity) => [rarity, [] as PlayerCardData[]]));
  for (const card of cards) {
    pool.get(rarityOf(card.tier.key))!.push(card);
  }
  return pool;
}

/** Weighted class draw. Consumes exactly one rand value, walking
 *  RARITY_ORDER worst-first so a scripted 0 always yields common. */
function rollClass(rand: () => number): RarityClass {
  const total = RARITY_ORDER.reduce((sum, rarity) => sum + RARITY_WEIGHTS[rarity], 0);
  let ticket = rand() * total;
  for (const rarity of RARITY_ORDER) {
    ticket -= RARITY_WEIGHTS[rarity];
    if (ticket < 0) return rarity;
  }
  // Only reachable if rand() returns exactly 1 (outside Math.random's range).
  return RARITY_ORDER[RARITY_ORDER.length - 1];
}

/**
 * The class a roll actually resolves to. Small leagues routinely have no
 * Master or Challenger at all, and a slot that rolled an empty class has to
 * pay out *something* — it falls to the next-lower non-empty class (a
 * downgrade the player never notices), and only walks upward if there is
 * nothing below either. Null means the whole pool is empty.
 */
function resolveClass(pool: Pool, wanted: RarityClass): RarityClass | null {
  const rank = rarityRank(wanted);
  for (let i = rank; i >= 0; i--) {
    if (pool.get(RARITY_ORDER[i])!.length > 0) return RARITY_ORDER[i];
  }
  for (let i = rank + 1; i < RARITY_ORDER.length; i++) {
    if (pool.get(RARITY_ORDER[i])!.length > 0) return RARITY_ORDER[i];
  }
  return null;
}

/** Best non-empty class at `floor` or above, walking down from the top —
 *  the class the guarantee slot is forced from. Null if none qualify. */
function bestClassAtLeast(pool: Pool, floor: RarityClass): RarityClass | null {
  for (let i = RARITY_ORDER.length - 1; i >= rarityRank(floor); i--) {
    if (pool.get(RARITY_ORDER[i])!.length > 0) return RARITY_ORDER[i];
  }
  return null;
}

/** Uniform pick within a class, then the foil roll — two rand values, in
 *  that order (the tests depend on the ordering). */
function pull(pool: Pool, rarity: RarityClass, rand: () => number): PackPull {
  const cards = pool.get(rarity)!;
  const index = Math.min(cards.length - 1, Math.max(0, Math.floor(rand() * cards.length)));
  return { card: cards[index], foil: rand() < FOIL_CHANCE };
}

/**
 * Rolls one pack of PACK_SIZE cards from `cards`, in the order rolled.
 *
 * Duplicates across slots are allowed on purpose: this is a collectible
 * economy, and dupes are what make trading (and a dupe-heavy pull feeling
 * like a bad pack) meaningful. An empty pool yields an empty pack — callers
 * are expected to have refused the purchase before getting here.
 *
 * Rand consumption per slot is class → card index → foil, so a scripted
 * queue reads in that order.
 */
export function rollPack(cards: PlayerCardData[], rand: () => number): PackPull[] {
  if (cards.length === 0) return [];
  const pool = groupByRarity(cards);

  const pulls: PackPull[] = [];
  for (let slot = 0; slot < PACK_SIZE; slot++) {
    const rarity = resolveClass(pool, rollClass(rand));
    if (!rarity) return pulls; // unreachable: cards.length > 0 means some class has entries
    pulls.push(pull(pool, rarity, rand));
  }

  // The bad-beat guarantee: an all-common pack is replaced at its last slot
  // by a forced rare-or-better pull. Done after the fact rather than by
  // reserving a slot up front so that lucky packs keep all five free rolls.
  const guaranteeRank = rarityRank(GUARANTEED_CLASS);
  const hasGuarantee = pulls.some((entry) => rarityRank(rarityOf(entry.card.tier.key)) >= guaranteeRank);
  if (!hasGuarantee) {
    const forced = bestClassAtLeast(pool, GUARANTEED_CLASS);
    // No rare-or-better card exists in this league at all — nothing to
    // upgrade to, so the pack stands as rolled.
    if (forced) pulls[pulls.length - 1] = pull(pool, forced, rand);
  }

  return pulls;
}
