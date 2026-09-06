// The finishes: Shiny, StatTrak and Secret, rolled over a pack.
//
// Three stamps a player-card print can take on top of its parallel and its
// ink, each on its own gate (packs/config.ts). Pure: the roller takes a
// rand and a pack and says which prints took what; the stamper writes the
// frozen fields into the card json. open.ts wires them around the one
// database read a Secret needs (how many have been found this season,
// which is what its over-number counts up from).
//
// Order matters for the scripted rolls in open.ts's callers: this runs
// AFTER the Eclipse pass and draws nothing for a print that is not
// eligible, so every existing draw in a pack is exactly where it was.

import type { PlayerCardData } from "@/lib/cards/build";
import { ECLIPSE_FOIL_TYPE, SECRET_CHANCE, SHINY_CHANCE, STATTRAK_CHANCE } from "./config";

export interface FinishRoll {
  shiny: boolean;
  stattrak: boolean;
  secret: boolean;
}

const NONE: FinishRoll = { shiny: false, stattrak: false, secret: false };

/** A print that can take a finish: a player card, and not the one-of-one.
 *  Moments, roster plates and champions relics are already the rare thing
 *  they are, and an Eclipse is not a tier of anything. */
export function finishEligible(print: { card: Pick<PlayerCardData, "moment" | "team" | "champWin">; foilType: string | null }): boolean {
  if (print.card.moment || print.card.team || print.card.champWin) return false;
  return print.foilType !== ECLIPSE_FOIL_TYPE;
}

/**
 * Roll every print in a pack. Three independent gates per eligible print,
 * in a fixed order (shiny, stattrak, secret) so a scripted rand reads the
 * same way every time; then the one pack-wide rule — at most one Secret
 * — keeps the first and drops the rest. A pack that mints two prints
 * numbered past the checklist reads as a bug however legitimate it was.
 */
export function rollPackFinishes(
  prints: { card: Pick<PlayerCardData, "moment" | "team" | "champWin">; foilType: string | null }[],
  rand: () => number,
): FinishRoll[] {
  let secretTaken = false;
  return prints.map((print) => {
    if (!finishEligible(print)) return NONE;
    const shiny = rand() < SHINY_CHANCE;
    const stattrak = rand() < STATTRAK_CHANCE;
    let secret = rand() < SECRET_CHANCE;
    if (secret && secretTaken) secret = false;
    if (secret) secretTaken = true;
    return { shiny, stattrak, secret };
  });
}

/**
 * Freeze a roll into the card json. `secretsFound` is how many Secrets the
 * season had minted BEFORE this one: the over-number is the checklist plus
 * that plus one, so the first Secret in a 120-card season is #121/120.
 * The checklist is the card's own `collectionSize`, frozen with it.
 */
export function stampFinishes(card: PlayerCardData, roll: FinishRoll, opts: { secretsFound: number; now: Date }): PlayerCardData {
  if (!roll.shiny && !roll.stattrak && !roll.secret) return card;
  // A solo build carries collectionSize 0 (build.ts); a checklist of nothing
  // still numbers, it just counts from zero. Never NaN into frozen json.
  const checklist = Number.isFinite(card.collectionSize) ? Math.max(0, card.collectionSize) : 0;
  return {
    ...card,
    ...(roll.shiny ? { shiny: true } : {}),
    ...(roll.stattrak ? { stattrak: { points: 0, since: opts.now.toISOString() } } : {}),
    ...(roll.secret ? { secret: { number: checklist + opts.secretsFound + 1, of: checklist } } : {}),
  };
}

/** "#121/120" — how a Secret's serial line reads. */
export function secretSerialLabel(secret: { number: number; of: number }): string {
  return `#${secret.number}/${secret.of}`;
}

/** "1,284" — the StatTrak count, as the card prints it. */
export function stattrakLabel(points: number): string {
  return Math.max(0, Math.round(points)).toLocaleString("en-US");
}
