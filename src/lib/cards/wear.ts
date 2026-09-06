// Wear and slabbing — a copy's history, and the seal that freezes it.
//
// `card.wear` counts how many times a copy has been fielded: an expedition
// launch, a Gauntlet run, a scored Fantasy week (migration 20260922). The
// grade is a reading of that number, borrowed from the game every
// collector already knows the words from. A slab is the owner's one-way
// choice: `card.slab {wear, at}` freezes the wear at that moment and the
// copy can never be fielded again — launch_expedition's table refuses it
// in SQL, the Gauntlet and Fantasy entry checks refuse it server-side,
// and every picker greys it. Nothing here prices: wear and slabs are
// cosmetic, and dustValueOf never reads them.

import type { PlayerCardData } from "./build";

export type WearGradeKey = "fn" | "mw" | "ft" | "ww" | "bs";

export interface WearGrade {
  key: WearGradeKey;
  label: string;
  /** Fieldings at which the grade starts. */
  min: number;
  /** The scuff layer PlayerCard3D draws for it (globals.css), or none —
   *  the first three grades are words, not marks; a card that has been out
   *  twice should not look damaged. */
  layer: string | null;
}

/** Worst last. Thresholds are fieldings, not games: an expedition is one,
 *  a Gauntlet run is one, a Fantasy week is one. Eleven is a card that
 *  has been out most weeks of a split. */
export const WEAR_GRADES: WearGrade[] = [
  { key: "fn", label: "Factory New", min: 0, layer: null },
  { key: "mw", label: "Minimal Wear", min: 1, layer: null },
  { key: "ft", label: "Field-Tested", min: 3, layer: null },
  { key: "ww", label: "Well-Worn", min: 6, layer: "card-wear-ww" },
  { key: "bs", label: "Battle-Scarred", min: 11, layer: "card-wear-bs" },
];

/** How many times a copy has been fielded. Zero on a copy that predates
 *  the counter — every copy was Factory New when this shipped. */
export function wearOf(card: Pick<PlayerCardData, "wear"> | null | undefined): number {
  const wear = Number(card?.wear ?? 0);
  return Number.isFinite(wear) && wear > 0 ? Math.floor(wear) : 0;
}

export function wearGradeOf(wear: number): WearGrade {
  let grade = WEAR_GRADES[0];
  for (const candidate of WEAR_GRADES) if (wear >= candidate.min) grade = candidate;
  return grade;
}

export function isSlabbed(card: Pick<PlayerCardData, "slab"> | null | undefined): boolean {
  return Boolean(card?.slab);
}

/** The grade a copy shows: the one frozen in its slab, else the one its
 *  wear reads today. */
export function gradeOf(card: Pick<PlayerCardData, "wear" | "slab"> | null | undefined): WearGrade {
  return wearGradeOf(card?.slab ? Math.max(0, Math.floor(Number(card.slab.wear) || 0)) : wearOf(card));
}

/** The one sentence every fielding refusal says. */
export function slabRefusal(name: string): string {
  return `${name} is sealed in a slab — a slabbed card can't be fielded.`;
}
