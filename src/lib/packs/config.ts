// Tunables for the card-pack economy. Everything the pack odds and pricing
// depend on lives here so a balance pass is a one-file change — the roller
// (rng.ts), the server action (actions.ts) and any UI read these constants
// rather than hardcoding their own.

import { MUTATION_EFFECTS, type MutationKey } from "@/lib/cards/mutations";
import type { CardTier } from "@/lib/cards/build";
import { CHAMPION_DUST, CHAMPION_TIER } from "@/lib/cards/champions";
import { MOMENT_DUST, MOMENT_TIER } from "@/lib/cards/moments";
import { TEAM_DUST, TEAM_TIER } from "@/lib/cards/teamCards";

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

/**
 * The Weekly Draw pot, in betting dollars — paid with one standard pack
 * comp on top. Sized against PACK_COST deliberately: winning feels real
 * but never dwarfs playing the actual games.
 */
export const WEEKLY_DRAW_POT = 250;

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

/** The foil chance while a Live Drops window is open — being in the room
 *  while the games run is worth half again the shine. Applies to the whole
 *  pack; parallels still roll at their normal weights inside it. */
export const LIVE_FOIL_CHANCE = 0.09;

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

/**
 * ECLIPSE — the one-of-one, and the reason this list is separate from the
 * one above.
 *
 * FOIL_TYPES is the LADDER: rollFoilType walks it and FOIL_TYPE_WEIGHTS is
 * keyed on it, so every parallel in it competes for the same foil pull.
 * Eclipse is in neither, and that is still deliberate — it does not compete
 * with Cracked Ice, it is not reachable by drawing a weight, and no edit to
 * the weights table can produce one by accident.
 *
 * It comes through its own gate instead (ECLIPSE_CHANCE), which is narrower
 * than any weight could express: it can only fall on a Card of the Week.
 */
export const CHASE_FOIL_TYPES = ["eclipse"] as const;

/** Every parallel that can be RENDERED. */
export const ALL_FOIL_TYPES = [...FOIL_TYPES, ...CHASE_FOIL_TYPES] as const;
export type FoilType = (typeof ALL_FOIL_TYPES)[number];
/** Narrower alias for the ones the ordinary foil roll can produce. */
export type MintableFoilType = (typeof FOIL_TYPES)[number];

/**
 * Chance an Eclipse falls on a Card-of-the-Week pull.
 *
 * Half a percent, and the number only means anything through the gate in
 * front of it. A Card of the Week is the top-rated card in each ROLE — five
 * per week — and because the roller picks uniformly inside a rarity class,
 * one lands in roughly 2-4% of pack SLOTS depending on how top-heavy the
 * league is (a thin league is the HIGHER figure: fewer legendaries means
 * each one is likelier when that class hits). Multiplying through:
 *
 *     ~0.5% of Card-of-the-Week pulls
 *   × ~2-4% of slots being one
 *   = roughly 1 Eclipse per 1,000-2,000 packs
 *
 * Which lands at about one a season at the league's current volume — rare
 * enough that most people never see one, common enough that they exist.
 *
 * It is deliberately NOT tuned so that each week reliably produces one. It
 * does not have to: an unclaimed Eclipse stays claimable forever through
 * that week's packs, so the back catalogue of unminted ones grows every
 * week and the chase is always live. That is what lets this number be flat
 * and small instead of escalating to guarantee a weekly hit.
 *
 * Because the rate rides the Card-of-the-Week gate rather than the whole
 * pool, the real odds drift with the league's shape: as more players reach
 * the top tiers, Eclipses quietly get rarer on their own.
 */
export const ECLIPSE_CHANCE = 0.005;

/** The parallel a Card of the Week wears when the Eclipse gate opens. */
export const ECLIPSE_FOIL_TYPE: FoilType = "eclipse";

/** The base, and what every foil minted before parallels existed IS. Never
 *  change this: the migration backfilled real copies to it, and a pulled
 *  card's look is frozen at mint like everything else on it. */
export const DEFAULT_FOIL_TYPE: MintableFoilType = "prisma";

/** Relative weights within a foil pull. Multiply by FOIL_CHANCE for the
 *  real per-card odds: Prisma 3.6%, Aurora 1.5%, Refractor 0.72%, Cracked
 *  Ice 0.18% — roughly one Cracked Ice per 111 packs, which puts it just
 *  past a signature (SIGNED_CHANCE, 1%) as the hardest cosmetic to hit. */
export const FOIL_TYPE_WEIGHTS: Record<MintableFoilType, number> = {
  prisma: 60,
  aurora: 25,
  refractor: 12,
  ice: 3,
};

/**
 * Dust multiplier per parallel, replacing the flat FOIL_DUST_MULT.
 *
 * Steeper than the first cut (2 / 2.5 / 3 / 5), which paid Cracked Ice —
 * twenty times rarer than a Prisma — only two and a half times as much.
 * Still deliberately SUB-proportional to the drop odds: rarity-true
 * pricing would put Ice past a moment, and the ceiling is the invariant
 * that matters. The top of the ladder takes a legendary from 150 to 975,
 * a real premium that stays under MOMENT_DUST (1000) — moments remain the
 * most valuable thing anyone can hold, and a lucky foil roll never
 * outranks a performance that actually happened.
 *
 * Prisma is pinned to FOIL_DUST_MULT: every foil minted before parallels
 * existed is a Prisma, so moving it would silently reprice old
 * collections. Values are read at DUST time from the copy's columns, so a
 * ladder change reaches every copy already pulled — which is the point.
 */
export const FOIL_TYPE_DUST_MULT: Record<FoilType, number> = {
  prisma: FOIL_DUST_MULT,
  aurora: 3,
  refractor: 4.5,
  ice: 6.5,
  // Priced above the ladder for completeness only. The real answer for a
  // 1/1 is that the dust path REFUSES it — a number, however large, is
  // still a number somebody can accept at three in the morning. Nothing
  // can mint one today, so this line is unreachable either way.
  // Zero, and it must stay zero: dust_card refuses an Eclipse outright
  // (20260911000001), so any other number here would be a price the
  // ledger never pays. Every dust surface reads its label from this table,
  // which is exactly why the lie would show up on a button.
  eclipse: 0,
};

/** What the card calls each parallel. */
export const FOIL_TYPE_LABELS: Record<FoilType, string> = {
  prisma: "Prisma",
  aurora: "Aurora",
  refractor: "Refractor",
  ice: "Cracked Ice",
  eclipse: "Eclipse",
};

/** A stored value narrowed to a FoilType, falling back to the base.
 *  card_inventory.foil_type is plain text, and an unrecognised value must
 *  render and price as an ordinary foil rather than crash a collection. */
export function foilTypeOf(value: string | null | undefined): FoilType {
  return (ALL_FOIL_TYPES as readonly string[]).includes(value ?? "")
    ? (value as FoilType)
    : DEFAULT_FOIL_TYPE;
}

/** Weighted pick of a parallel. Consumes exactly one rand. */
export function rollFoilType(rand: () => number): MintableFoilType {
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

// === Finishes: Shiny, Secret, StatTrak ======================================
//
// Three more things a player-card print can come out as, each rolled on its
// own gate AFTER the parallel, the autograph and the Eclipse have been
// settled, and each independent of them — a Shiny can be foil, a Secret can
// be signed. None of them touches a moment, a roster plate, a champions
// relic or an Eclipse: those are already the rare thing they are. Rolled in
// src/lib/packs/rarities.ts; drawn in PlayerCard3D; explained on
// /cards/rarities, which reads these numbers rather than restating them.

/**
 * Shiny — the same card in the wrong colours: the art hue-shifted, a
 * sparkle burst over it. One in sixty-four, the number every collector
 * already knows from the game that invented the idea. That is 7.6% of
 * packs, a little rarer than a foil (FOIL_CHANCE × PACK_SIZE ≈ 30% of
 * packs): a shiny is a thing you tell the channel about, not a thing you
 * expect from a night of ripping.
 */
export const SHINY_CHANCE = 1 / 64;

/** What a Shiny does to dust: half again. Less than the Aurora rung (×3):
 *  it is a colour, not a parallel, and the money-printer guardrail (see
 *  SIGNED_DUST_BASE) has no room for another doubling on a 1-in-64 gate. */
export const SHINY_DUST_MULT = 1.5;

/**
 * StatTrak — a counter on the copy that tracks the fantasy points it scores
 * in YOUR hands, and resets when it changes hands. One in fifty, roughly
 * one pack in ten: common enough that most collectors will hold one, rare
 * enough that a high count is a story about a card somebody kept fielding.
 * Worth nothing extra to dust: the counter is the value, and a counter
 * you have not run up yet is worth exactly what the card under it is.
 */
export const STATTRAK_CHANCE = 0.02;

/**
 * Secret — a print numbered past the checklist. Numbered from the top of
 * the collection: in a season of 120 cards, the first Secret found is
 * #121/120, the next #122/120. One in five hundred per card, one per
 * thousand packs' worth of prints — a hair rarer than an Eclipse gate
 * (ECLIPSE_CHANCE, 0.5%) but on ANY player card rather than the Card of
 * the Week, so it is the rarest thing an ordinary pull can be. Announced
 * to the channel when it lands, like an Eclipse. At most one per pack.
 */
export const SECRET_CHANCE = 0.002;

/** What a Secret does to dust: doubles it, over the parallel. On any
 *  ordinary tier the whole stack (Cracked Ice, Shiny, Secret) still prices
 *  under what a signature adds; only a Secret Cracked Ice challenger beats
 *  the autograph, and that is a 1-in-500 on a 1-in-555 on a 1-in-100 —
 *  a card the league may never see. The guardrail (SIGNED_DUST_BASE)
 *  holds: at these gates the finishes add under a dollar to a pack's
 *  expected dust. */
export const SECRET_DUST_MULT = 2;

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
/** Whether a copy can be dusted at all. The only refusal that is a property
 *  of the copy rather than of its situation (fielded, on expedition): a
 *  one-of-one is not a resource. dust_card raises for it and the actions
 *  refuse before calling; this is the same rule for the labels. */
export function canDust(row: { foilType?: string | null }): boolean {
  return row.foilType !== ECLIPSE_FOIL_TYPE;
}

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
  /** Same story for a champions relic: the flag covers a caller holding
   *  the card json (whose wrapper tier is a placeholder), the flat column
   *  covers a stored copy. */
  champWin?: boolean;
  /** A pulled roster plate prices flat, off TEAM_DUST — same reasoning as
   *  a moment: no tier of its own to scale from. */
  team?: boolean;
  /** The expedition mutation the copy wears, if any — the ONE stamp that
   *  changes a price (MUTATION_EFFECTS.dustMult): Cursed halves it,
   *  Hardened adds a quarter, Voidtouched doubles it. */
  mutation?: string | null;
  /** The finishes (SHINY_DUST_MULT, SECRET_DUST_MULT). Read off the card
   *  json by callers that hold it; a stored copy's flags live there too. */
  shiny?: boolean;
  secret?: boolean;
}): number {
  // Nothing at all for a copy that cannot be dusted — before any pricing,
  // because the autograph bonus is a flat add and would otherwise put a
  // number under a signed Eclipse that the ledger will never pay.
  if (!canDust(row)) return 0;
  // Either signal is enough: the flat column says "moment" on a stored
  // copy, and the flag covers a caller holding the card json instead.
  if (row.moment || row.tier === MOMENT_TIER) return MOMENT_DUST;
  // Champions relics price flat and their foil does NOT multiply — the
  // parallel is the flex, and a one-card pack has no room for multipliers
  // before dusting beats CHAMPIONS_PACK_COST and becomes an income. The
  // autograph bonus still applies: real ink is real ink on any card.
  if (row.champWin || row.tier === CHAMPION_TIER) return CHAMPION_DUST + (row.signed ? SIGNED_DUST_BASE : 0);
  if (row.team || row.tier === TEAM_TIER) return TEAM_DUST;
  const rarity = RARITY_BY_TIER[row.tier as CardTierKey] ?? "common";
  let value = DUST_VALUES[rarity];
  // Rounded because the middle of the ladder is fractional (2.5) and dust
  // is a whole-number currency — an un-rounded 62.5 would drift the ledger.
  if (row.foil) value = Math.round(value * FOIL_TYPE_DUST_MULT[foilTypeOf(row.foilType)]);
  // The finishes multiply the print like a parallel does, under the ink:
  // a signature is a flat add on ANY card, and stays the biggest number.
  if (row.shiny) value = Math.round(value * SHINY_DUST_MULT);
  if (row.secret) value = Math.round(value * SECRET_DUST_MULT);
  if (row.signed) value += SIGNED_DUST_BASE;
  // Last, over the whole number: a curse halves a signed foil's ink too.
  const mutation = row.mutation ? MUTATION_EFFECTS[row.mutation as MutationKey] : undefined;
  if (mutation && mutation.dustMult !== 1) value = Math.round(value * mutation.dustMult);
  return value;
}

/**
 * The patron dust bonus: every copy a patron melts pays 20% more.
 *
 * The one patron perk that touches money, sized against the same
 * money-printer guardrail as everything in this file: at ×1.2 a pack's
 * expected dust return moves from ~41% to ~49% of its cost — a smaller
 * loss, never an income. Applied at DUST time off patron status, so a
 * lapsed patronage stops paying immediately and nothing is stamped on
 * the copies themselves.
 */
export const PATRON_DUST_MULT = 1.2;

/**
 * How many copies one mass-dust may destroy.
 *
 * Lives here rather than in the action because THREE places have to agree
 * on it — the server that enforces it, the pack overlay, and the shelf's
 * select mode — and a client that lets someone tick 60 cards only to be
 * told "too many" after the tap is a worse rule than a lower one. The
 * expedition payout guard is the cautionary tale: a limit written twice
 * is a limit that drifts.
 *
 * Fifty rather than the original ten: ten was sized for a five-card pack,
 * and a shelf clear-out is the case that actually needs a batch. Each
 * copy is still one dust_card call under its own lock, so this bounds the
 * work of one request, not the safety of any single destroy.
 */
export const MAX_DUST_BATCH = 50;

/** dustValueOf with the patron bonus applied — the ONE function every
 *  dust surface (actions and displayed prices alike) goes through, so the
 *  button can never quote a different number than the ledger credits.
 *  Rounded because dust is a whole-dollar currency. */
export function patronDustValue(row: Parameters<typeof dustValueOf>[0], patron: boolean): number {
  const value = dustValueOf(row);
  return patron ? Math.round(value * PATRON_DUST_MULT) : value;
}

/** Position in RARITY_ORDER — higher is better. */
export function rarityRank(rarity: RarityClass): number {
  return RARITY_ORDER.indexOf(rarity);
}
