// Bodies for the lane map.
//
// The sim resolves a match into beats; this decides who those beats LOOK
// like. Two rules, and the first is the important one:
//
//  1. NOTHING HERE TOUCHES A ROLL. The opponent cast is drawn off the
//     week's seeded RNG (opponents.ts), and every value that stream
//     produces is load-bearing — a whole league fights the same five, and
//     an active run replays against the seed it stored. So a champion is
//     never drawn from that stream. It is hashed out of the name the
//     opponent already has, which is stable, needs no seed passed around,
//     and cannot shift a single rating.
//
//  2. Your own cards bring their own champion — the one their week's card
//     prints, off `signature`. A card frozen before that existed, or a
//     trialist standing in for a role nobody covers, falls back to the
//     same hash so every slot has a body.

import { CHAMPIONS } from "@/lib/match-draft/champions";
import type { GauntletCard, GauntletRole } from "./sim";

/** FNV-1a, the same hash weekSeed uses — stable across processes, which a
 *  string hash has to be when two people must see the same cast. */
function hash(text: string): number {
  let value = 0x811c9dc5;
  for (let index = 0; index < text.length; index += 1) {
    value ^= text.charCodeAt(index);
    value = Math.imul(value, 0x01000193) >>> 0;
  }
  return value >>> 0;
}

/**
 * A champion for someone who did not bring one.
 *
 * Deterministic in the name and role, so the same opponent wears the same
 * face every time anybody watches that week — including on a replay days
 * later, and including for two different people watching the same seeded
 * cast. That is the whole reason this is a hash and not a roll.
 */
export function faceFor(name: string, role: GauntletRole): string {
  if (CHAMPIONS.length === 0) return "Ahri";
  return CHAMPIONS[hash(`${name}|${role}`) % CHAMPIONS.length].name;
}

/** The champion a card fights as: its own if it has one, else a stable
 *  stand-in. `champion` rides on GauntletCard for cards drafted after this
 *  shipped; a run already in the field has none and falls back. */
export function faceOf(card: Pick<GauntletCard, "name" | "role" | "champion">): string {
  return card.champion?.trim() || faceFor(card.name, card.role);
}
