// The Faceless Drop — Season Four's champions as the Dealer's Hand.
//
// Five cards, one hand of spades, printed in the winners' own iconography:
// the roster's names ARE ranks (king of spades, i am atomic the Ace, 7gen
// the Seven, the fool the Joker; Shanedata takes the Queen). The set is
// STATIC CONTENT, not derived: S4 is only partially ingested, so the
// roster below is the one the league dictated, and the only stat a card
// carries is the player's most-played champion from the data that does
// exist — pulled once by hand (2026-08) and frozen here with the set.
//
// PREVIEW-ONLY for now: nothing mints these. The renderer and this set
// ship first so the league's owner can see real cards (real splash art,
// real foil layers, real ink) at /admin/champions before the pack drop
// is built.
//
// Framework-free like moments.ts: renderers and tests both import this.

import type { PlayerCardData } from "./build";

/** One card of the Hand, as designed — nothing here changes at runtime. */
export interface ChampionCardDef {
  /** Corner index: "K", "A", "Q", "7", or "JOKER". */
  rank: string;
  /** Set position, 1-5, printed as "The Hand · N of 5". */
  setIndex: number;
  /** The name the league knows them by — what the card prints. */
  name: string;
  /** The riot account the stats live under (provenance, not display). */
  riot: { summoner: string; tag: string };
  /** Most played champion in the held data, display form — resolved to
   *  splash art through the same helpers player cards use. */
  champion: string;
  /** The Joker prints inverted — bone pip, red-rimmed. */
  joker?: boolean;
}

export const CHAMPIONS_TEAM = "Faceless";
export const CHAMPIONS_SEASON = "S4";
export const CHAMPIONS_SET_NAME = "The Hand";

/** The committed full-res mark (imported by the import-faceless-logo
 *  workflow) — pinned so a minted relic never depends on a team row. */
export const CHAMPIONS_LOGO_PATH = "/faceless-logo.png";

/** K · A · Q · 7 · Joker — the order the set is spoken in. */
export const CHAMPIONS_SET: ChampionCardDef[] = [
  { rank: "K", setIndex: 1, name: "king of spades", riot: { summoner: "KingOfSpades", tag: "205" }, champion: "Cho'Gath" },
  { rank: "A", setIndex: 2, name: "i am atomic", riot: { summoner: "I am ATOMIC", tag: "4782" }, champion: "Rell" },
  // Prints the summoner name, per the league owner — Shanedata is the
  // human, Feral Eevee is the account the S4 title was won on.
  { rank: "Q", setIndex: 3, name: "Feral Eevee", riot: { summoner: "Feral Eevee", tag: "133" }, champion: "Aurelion Sol" },
  { rank: "7", setIndex: 4, name: "7gen", riot: { summoner: "7gen", tag: "4444" }, champion: "Jhin" },
  { rank: "JOKER", setIndex: 5, name: "the fool", riot: { summoner: "The Fool", tag: "URMAM" }, champion: "Xin Zhao", joker: true },
];

/** card_inventory's flat `tier` for a champions card — same trick as
 *  MOMENT_TIER: not a rating tier, just what dust pricing reads. */
export const CHAMPION_TIER = "champion";

/**
 * Dust for a champions card. Flat, and FOIL DOES NOT MULTIPLY IT — the
 * parallel is the flex, not the price. The autograph bonus still adds on
 * top (dustValueOf owns that composition).
 *
 * MUST stay below CHAMPIONS_PACK_COST: a Faceless pack is one guaranteed
 * card, so any dust value at or above the pack price is a money printer,
 * not a salvage floor (the first cut of 750 against a 250 pack paid $500
 * per click). Legendary's base (150) is the ceiling that feels right —
 * the relic's worth is the shelf, not the shredder. Expected return per
 * pack, signed jackpot included, stays near 84% of cost at worst.
 */
export const CHAMPION_DUST = 150;

/** What one Faceless Pack costs — ONE card from the Hand. Priced above
 *  the five-card pack on purpose: this is a relic run, not a bundle. */
export const CHAMPIONS_PACK_COST = 250;

/** Foil odds inside the drop. Boosted over the everyday 6%: a one-card
 *  pack at base odds would foil a handful of times league-wide in a
 *  one-week window, and the story deserves better. Parallels roll the
 *  normal ladder. */
export const CHAMPION_FOIL_CHANCE = 0.12;

/** Autograph odds — rolled ONLY for champions whose real drawn ink is on
 *  file. Two of the five can't currently sign, and a printed script
 *  signature for someone who never held the pen isn't an autograph. */
export const CHAMPION_SIGNED_CHANCE = 0.05;

/** Uniform draw from the Hand — every rank equally likely, every pack. */
export function rollChampionCard(rand: () => number): ChampionCardDef {
  return CHAMPIONS_SET[Math.min(CHAMPIONS_SET.length - 1, Math.floor(rand() * CHAMPIONS_SET.length))];
}

/**
 * The card-shaped wrapper a champions card is stored and rendered as —
 * momentToCard's sibling. Rating fields are placeholders behind the
 * `champWin` branch; `season` is the CURRENT season so a copy will live
 * on the collector's present-day shelf, while the card itself names the
 * season it commemorates.
 */
export function championToCard(def: ChampionCardDef, season: string, copySerial?: number): PlayerCardData {
  return {
    champWin: {
      rank: def.rank,
      setIndex: def.setIndex,
      setSize: CHAMPIONS_SET.length,
      team: CHAMPIONS_TEAM,
      seasonWon: CHAMPIONS_SEASON,
      champion: def.champion,
      joker: def.joker === true,
      // Which mint of this rank the copy is (1 = first pulled). Frozen
      // like everything else; absent on preview renders.
      ...(copySerial ? { copySerial } : {}),
    },
    // Slug of its own per rank, so a shelf keeps five entries and "do I
    // own this player" never answers yes because of a relic.
    slug: `faceless-${def.rank.toLowerCase()}`,
    name: def.name,
    tag: def.riot.tag,
    teamName: CHAMPIONS_TEAM,
    teamImageUrl: null,
    role: "Champion",
    overall: 0,
    // Same trick as momentToCard: the json wrapper carries a placeholder
    // key from the real union (never rendered — the champWin branch wins),
    // while the flat inventory column will hold CHAMPION_TIER at mint.
    tier: { key: "gold", label: "Champion" },
    archetype: CHAMPIONS_SET_NAME,
    signature: null,
    artSkin: 0,
    motto: null,
    serial: def.setIndex,
    collectionSize: CHAMPIONS_SET.length,
    topChampions: [],
    form: [],
    subStats: [],
    highlights: [],
    badges: [],
    standout: false,
    wins: 0,
    losses: 0,
    winratePct: 0,
    level: 0,
    pentas: 0,
    season,
  };
}
