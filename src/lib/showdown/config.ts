// Showdown — Hold'em played with the player cards, for wallet points.
//
// Every number a player can read on the rules page is IMPORTED from here,
// and the server enforces the same values (the RPCs read them through the
// seeded showdown_config row that a test holds to this file). A rules page
// that quietly disagrees with the table is worse than no rules page.
//
// THE RULE THAT GOVERNS EVERYTHING: only points are ever at stake. A card
// sits at a table; it is never won, lost or put up. And patronage touches
// none of it — no better cards, no better dealing, no discount on the rake.

/** How many cards a player brings to a table. Two are dealt from them as
 *  hole cards each hand. */
export const STACK_SIZE = 10;

/** Cards per player per hand, and on the board. */
export const HOLE_CARDS = 2;
export const BOARD_CARDS = 5;

export const SEATS_MAX = 6;
/** A table with fewer seated players than this waits between hands. */
export const SEATS_TO_DEAL = 2;

/** Seconds to act before the clock folds you (or checks, where free). */
export const ACTION_SECONDS = 45;
/** Consecutive timeouts before a seat is sat out. */
export const TIMEOUTS_TO_SIT_OUT = 3;

/** Rake: a share of every pot that reaches a flop, capped in big blinds,
 *  burned. "No flop, no drop." */
export const RAKE_PCT = 0.03;
export const RAKE_CAP_BIG_BLINDS = 5;

export type BracketKey = "low" | "open";

export interface Bracket {
  key: BracketKey;
  label: string;
  smallBlind: number;
  bigBlind: number;
  minBuyIn: number;
  maxBuyIn: number;
  /** The ten overalls in a stack, added together, may not exceed this. */
  stackCap: number;
}

export const BRACKETS: Record<BracketKey, Bracket> = {
  low: { key: "low", label: "Low", smallBlind: 5, bigBlind: 10, minBuyIn: 200, maxBuyIn: 1000, stackCap: 650 },
  open: { key: "open", label: "Open", smallBlind: 25, bigBlind: 50, minBuyIn: 1000, maxBuyIn: 5000, stackCap: 720 },
};

export const BRACKET_KEYS = Object.keys(BRACKETS) as BracketKey[];

/** Rake owed on a pot at a table, in points. Zero before the flop. */
export function rakeFor(pot: number, bracket: Bracket, sawFlop: boolean): number {
  if (!sawFlop || pot <= 0) return 0;
  return Math.min(Math.floor(pot * RAKE_PCT), RAKE_CAP_BIG_BLINDS * bracket.bigBlind);
}

/** Whether a stack fits a bracket: the right count, and under the cap. */
export function stackFits(overalls: number[], bracket: Bracket): { ok: true } | { ok: false; reason: string } {
  if (overalls.length !== STACK_SIZE) return { ok: false, reason: `A stack is ${STACK_SIZE} cards.` };
  const total = overalls.reduce((sum, value) => sum + value, 0);
  if (total > bracket.stackCap) {
    return { ok: false, reason: `That stack totals ${total} overall; the ${bracket.label} table's cap is ${bracket.stackCap}.` };
  }
  return { ok: true };
}
