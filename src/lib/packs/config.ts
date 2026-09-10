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

/** A standard pack becomes a God Pack on exactly one integer draw out of
 *  1,500 (it was 750 until 2026-09-08 — the whole board got stingier when
 *  earning dollars stopped being hard). */
export const GOD_PACK_ODDS_DENOMINATOR = 1500;
export const GOD_PACK_CHANCE = 1 / GOD_PACK_ODDS_DENOMINATOR;

export type PackVariant = "standard" | "god";

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
 * Tuned for "rewarding but rare" (2026-09-08 balance pass, down from
 * 75/20/4/1, which was itself down from 62/24/10/4): a pack averages ~0.9
 * rare-or-better pulls, a Diamond appears in roughly every 8th pack (11.9%
 * of packs), and a legendary in ~1 in 200 slots (~2.5% per pack, one pack
 * in forty, before the bad-beat guarantee's small tail) — an event, not an
 * expectation. Steeper than this and most packs feel like blanks; flatter
 * and the top of the collection stops meaning anything.
 *
 * The pass that got here: dollars now arrive from half a dozen routes and
 * the dust table is forgiving, so the scarce thing has to be the pull.
 * Weights are fractional on purpose — the roller draws rand() × total and
 * never assumes integers.
 */
export const RARITY_WEIGHTS: Record<RarityClass, number> = {
  common: 82,
  rare: 15,
  epic: 2.5,
  legendary: 0.5,
};

/** Chance any given pulled card comes out foil — a cosmetic variant, rolled
 *  independently of rarity so a foil bronze is a real (if modest) pull. At
 *  4% a card, about one pack in five carries one (18.5% of packs). (It was
 *  6% until 2026-09-08.) */
export const FOIL_CHANCE = 0.04;

/** The foil chance while a Live Drops window is open — being in the room
 *  while the games run is worth half again the shine, and this must stay
 *  exactly 1.5 × FOIL_CHANCE. Applies to the whole pack; parallels still
 *  roll at their normal weights inside it. (9% until 2026-09-08, against
 *  the old 6% base.) */
export const LIVE_FOIL_CHANCE = 0.06;

/** Chance a pulled copy prints in an ALTERNATE skin of the player's
 *  signature champion instead of the base splash. Base is the expected
 *  look, so an alternate print reads as a pull in its own right (about
 *  foil-tier); which alternate is uniform across the champion's validated
 *  catalog, so specific skins on big-catalog champions are genuinely hard
 *  to hit. One pull in five, and still five times the foil gate — the two
 *  moved together on 2026-09-08 (it was 30% against a 6% foil). */
export const ALT_SKIN_CHANCE = 0.2;

/**
 * The alternate-art chance on a SIGNED copy. Deliberately below
 * ALT_SKIN_CHANCE: a signed card is already the pull of the month and
 * always prints foil, so "signed + foil + alt art" is the one print that
 * should be genuinely hard to hit — one in ten signed copies rather than
 * one in five. Raise it to ALT_SKIN_CHANCE to make signed copies roll art
 * exactly like every other pull. (15% until 2026-09-08.)
 */
export const SIGNED_ALT_SKIN_CHANCE = 0.1;

/**
 * Chance a pulled card comes out autographed — the pen mark of the player
 * themselves, inked onto that copy forever. This is the PACK-LEVEL rate:
 * the odds of any given card in any given pack, which is what the rarity
 * page promises. Only players who have actually drawn a signature
 * (card_art_prefs.signature) can roll one, so the per-copy roll on a
 * signable card is this divided by the share of the pool that has signed
 * (signedChance in signatures.ts) — with a fifth of the league inked, each
 * of their cards rolls at 5% so the pack still sees 1 in 100.
 * Before 2026-09-10 the per-copy roll WAS this number, which made the true
 * pack odds this times the signed share: rarer than a Secret with a
 * 60-card pool and a dozen signers. (It was 1% until 2026-09-08, then
 * 0.5% until 2026-09-10 when the roll was normalised and the promise
 * lifted to 1 in 150, then to 1 in 100 later that night.) One card in
 * 100 — about 5% of packs — and well below FOIL_CHANCE: a foil is a nice
 * pull, a signed card is the story you tell about the pack you opened.
 */
export const SIGNED_CHANCE = 1 / 100;

/**
 * Ceiling on the per-copy autograph roll once it has been scaled up for a
 * thin signing book. One signer in a 60-card pool would otherwise roll at
 * 60% — most copies of that player signed — which is no
 * longer an autograph, it is a print run. At 5% the pack-level rate is
 * fully honest once a fifth of the pool has signed (12 of 60), and
 * tapers below SIGNED_CHANCE before that.
 */
export const SIGNED_CHANCE_CAP = 0.05;

/**
 * Every pack contains at least one card of this class or better. Without it
 * ~37% of packs (0.82^5) would be five commons — it was ~24% before the
 * 2026-09-08 weights, which is exactly why the guarantee matters more now
 * than it did — and that reads as a broken pack rather than a bad roll.
 * Enforced by rng.ts replacing the last slot with a weighted
 * rare-or-better re-roll.
 */
export const GUARANTEED_CLASS: RarityClass = "rare";

/**
 * What a copy is worth when dusted — sold back for betting dollars.
 *
 * Dusting is a floor for duplicates, never an arbitrage loop, and the
 * numbers are set so the arithmetic says so. At the RARITY_WEIGHTS above a
 * single slot dusts for 0.82×10 + 0.15×25 + 0.025×60 + 0.005×150 ≈ $14.2,
 * so a PACK_SIZE of five expects roughly $71 against a PACK_COST of 200 —
 * about 36 cents back on the dollar (a little more once the guaranteed
 * rare-or-better slot, the foil multiplier and the autograph bonus are
 * counted: ~$8.7, ~$4.8 and ~$30 respectively, so ~$115 all in — 57% of
 * the ticket, still nowhere near even). The 2026-09-08 weights took the
 * base from $82 to $71 without touching a single value in this table.
 * Grinding packs to dust therefore burns money; the only thing dusting is good for is turning a
 * fourth copy of the same bronze into something.
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
 * One in five hundred, and the number only means anything through the gate
 * in front of it. A Card of the Week is the top-rated card in each ROLE —
 * five per week — and because the roller picks uniformly inside a rarity
 * class, one lands in roughly 1.2-2.4% of pack SLOTS depending on how
 * top-heavy the league is (a thin league is the HIGHER figure: fewer
 * legendaries means each one is likelier when that class hits). That slot
 * share is itself down by a factor of ~0.6 since 2026-09-08, because epic
 * and legendary between them fell from 5% of the weights to 3% — so an
 * Eclipse got rarer twice over, once at its own gate and once at the gate
 * in front of it. Multiplying through:
 *
 *     ~0.2% of Card-of-the-Week pulls
 *   × ~1.2-2.4% of slots being one
 *   × 5 slots
 *   = roughly 1 Eclipse per 4,000-8,000 packs
 *
 * At the league's volume (call it 1,500 packs a season) that is one every
 * three to five seasons — rare enough that most people never see one,
 * common enough that they exist. (It was 0.5% until 20260907 and 0.4%
 * until 2026-09-08; the league found them a little too often, twice.)
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
export const ECLIPSE_CHANCE = 1 / 500;

/** The parallel a Card of the Week wears when the Eclipse gate opens. */
export const ECLIPSE_FOIL_TYPE: FoilType = "eclipse";

/** The base, and what every foil minted before parallels existed IS. Never
 *  change this: the migration backfilled real copies to it, and a pulled
 *  card's look is frozen at mint like everything else on it. */
export const DEFAULT_FOIL_TYPE: MintableFoilType = "prisma";

/** Relative weights within a foil pull. Multiply by FOIL_CHANCE for the
 *  real per-card odds: Prisma 2.8%, Aurora 0.8%, Refractor 0.32%, Cracked
 *  Ice 0.08% — roughly one Cracked Ice per 250 packs, which keeps it well
 *  past a signature (SIGNED_CHANCE, 1 in 100) as the hardest cosmetic to hit.
 *  Steepened on 2026-09-08 from 60/25/12/3, so the top of the ladder got
 *  rarer both from the smaller foil gate and from its own weight. */
export const FOIL_TYPE_WEIGHTS: Record<MintableFoilType, number> = {
  prisma: 70,
  aurora: 20,
  refractor: 8,
  ice: 2,
};

/**
 * Dust multiplier per parallel, replacing the flat FOIL_DUST_MULT.
 *
 * Steeper than the first cut (2 / 2.5 / 3 / 5), which paid Cracked Ice —
 * thirty-five times rarer than a Prisma on the current weights — only two
 * and a half times as much.
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
 * PACK_COST and returns ~$71 in expected class dust (~$85 once the
 * guarantee and the parallels are counted); signed copies add roughly
 * 0.025 × (this) per pack when the whole league has drawn a signature, so
 * 1200 lands total expected return near 57% of pack cost at worst — it was
 * 72% before the 2026-09-08 weights halved the signature gate. The bonus
 * itself did not move: at the new gate it would take about $4,600 here
 * before packs paid for themselves, so this number has room it did not
 * have when the break-even sat at ~1500.
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
 * sparkle burst over it. One in a hundred and twenty-eight: twice the
 * number every collector already knows from the game that invented the
 * idea, which is the shape a stingier league takes (it was 1 in 64 until
 * 2026-09-08). That is 3.8% of packs against a foil's 18.5%, so a shiny
 * is a thing you tell the channel about, not a thing you expect from a
 * night of ripping.
 */
export const SHINY_CHANCE = 1 / 128;

/** What a Shiny does to dust: half again. Less than the Aurora rung (×3):
 *  it is a colour, not a parallel, and the money-printer guardrail (see
 *  SIGNED_DUST_BASE) has no room for another doubling on a 1-in-128
 *  gate. */
export const SHINY_DUST_MULT = 1.5;

/**
 * StatTrak — a counter on the copy that tracks the pictured player's
 * Fantasy Pts for every game played while it is in YOUR hands, fielded
 * or not, and resets when it changes hands. One in a hundred, roughly one
 * pack in twenty (4.9%, and it was one in fifty until 2026-09-08): common
 * enough that most collectors will hold one eventually, rare enough that a
 * high count is a story about a card somebody kept fielding.
 * Worth nothing extra to dust: the counter is the value, and a counter
 * you have not run up yet is worth exactly what the card under it is.
 */
export const STATTRAK_CHANCE = 0.01;

/**
 * Secret — a print numbered past the checklist. Numbered from the top of
 * the collection: in a season of 120 cards, the first Secret found is
 * #121/120, the next #122/120. One in a thousand per card, so about one
 * pack in two hundred carries one — half the Eclipse gate's rate
 * (ECLIPSE_CHANCE, 0.2%) but on ANY player card rather than the Card of
 * the Week, so it is the rarest thing an ordinary pull can be. Announced
 * to the channel when it lands, like an Eclipse. At most one per pack.
 * (It was 1 in 500 until 2026-09-08; the halved gate keeps it exactly half
 * the Eclipse rate, which is the relation that matters here.)
 */
export const SECRET_CHANCE = 0.001;

/**
 * The Dribb card — five, ever.
 *
 * Not a player: Dribb, a 99 in every column, on Bard, in the Aether Rift
 * treatment nothing else wears (src/lib/cards/dribb.ts). Rolled ONCE PER
 * PACK, on every standard pack in every week's edition, and when it lands
 * it takes the pack's last slot. One in ten thousand packs (it was one in
 * five thousand until 2026-09-08) — at the league's volume, call it 1,500
 * packs a season, one turns up somewhere around every seventh season, and
 * the five will take a lifetime of the league to find. Once the fifth is
 * minted the gate closes for good: the roller reads the count before it
 * mints, and a partial unique index on the copy's number (migration
 * 20260929000001) is what makes "five" a fact rather than a promise.
 * Never dusts, never auto-dusts, never boards a route that can lose it;
 * it can be traded, which is the point.
 *
 * A SECRET. Nothing player-facing says it exists — not the rarities page,
 * not the stats page. The first anyone hears of it is the announcement
 * when one lands. The admin mockup page is staff-only.
 */
export const DRIBB_CHANCE = 1 / 10000;
export const DRIBB_COPIES = 5;
/** The tier column a Dribb copy files under, like a moment's "moment":
 *  it must never price or sort as an ordinary card of any tier. */
export const DRIBB_TIER = "dribb";

/** What a Secret does to dust: doubles it, over the parallel. On any
 *  ordinary tier the whole stack (Cracked Ice, Shiny, Secret) still prices
 *  under what a signature adds; only a Secret Cracked Ice challenger beats
 *  the autograph, and that is a 1-in-1,000 on a 1-in-1,250 on a 1-in-100 —
 *  a card the league will never see. The guardrail (SIGNED_DUST_BASE)
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
export function canDust(row: { foilType?: string | null; tier?: string; dribb?: boolean }): boolean {
  if (row.foilType === ECLIPSE_FOIL_TYPE) return false;
  // The Dribb card: five in the world. The flat column covers a stored
  // copy, the flag a caller holding the card json.
  if (row.dribb || row.tier === DRIBB_TIER) return false;
  return true;
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
  /** The Dribb card, read off the card json. */
  dribb?: boolean;
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
 * expected class dust moves from ~36% to ~43% of its cost — a smaller
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
