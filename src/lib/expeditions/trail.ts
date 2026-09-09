// Trail miles: what a card remembers of the roads it has walked.
//
// Every card that comes home alive is stamped with the run's miles —
// `card.trail = { miles, runs, deepest }` — by a trigger on the claim
// (20261010000001), so the stamp is as trustworthy as a mutation and no
// caller can skip it. This module is the pure reading of that stamp: how
// many miles a route is worth, what a card with enough of them is called,
// and what the title does. Rendering, the resolver's veteran shapes and
// shine all read from here so a threshold moved here moves everywhere.
//
// The thresholds are deliberately steep. Sixteen miles is five Legend
// Hunts or four Legendary routes survived — a real career, for a title
// that sharpens a role call. Thirty is a card that has been out more
// often than most collections have sent anything.

import type { ExpeditionTierKey } from "./config";

/** What each route is worth in miles to a card that comes home. An
 *  Exorcism is a rite, not a road, and pays none. The trigger that stamps
 *  these carries the same table in SQL; trail.test.ts holds the two
 *  together. */
export const MILES_BY_TIER: Record<ExpeditionTierKey, number> = {
  scout: 1,
  gilded: 2,
  raid: 2,
  legend: 3,
  rescue: 1,
  exorcism: 0,
  legendary: 4,
};

export type TrailTitleKey = "trailworn" | "veteran" | "wayfarer";

export interface TrailTitle {
  key: TrailTitleKey;
  label: string;
  /** Miles needed. */
  miles: number;
  /** What the title does, in one line — for the card's ledger and the
   *  rules page. */
  does: string;
  /** Badge ink. */
  accent: string;
}

/** The three titles, in order. A card holds the highest it has reached. */
export const TRAIL_TITLES: TrailTitle[] = [
  { key: "trailworn", label: "Trailworn", miles: 8, does: "A badge on the card, the shelf and the share picture.", accent: "#c9a46b" },
  { key: "veteran", label: "Veteran", miles: 16, does: "The card's own role call sharpens: a Jungle scouts at half risk, a Top's hold pays more, a Mid roams for more, a Bot kites at an eighth of the risk, a Support wards the lost and dead rolls to a quarter.", accent: "#e0b45a" },
  { key: "wayfarer", label: "Wayfarer", miles: 30, does: "A worn-leather frame on the card everywhere it shows, and one more shine.", accent: "#f3d58a" },
];

export const TRAILWORN_MILES = TRAIL_TITLES[0].miles;
export const VETERAN_MILES = TRAIL_TITLES[1].miles;
export const WAYFARER_MILES = TRAIL_TITLES[2].miles;

/** What a Wayfarer adds to shine. One: a title is a reason to send the
 *  card, never a way past a gate it has no business running. */
export const WAYFARER_SHINE = 1;

/** The stamp as the card json carries it. */
export interface TrailStamp {
  miles: number;
  runs: number;
  /** The deepest route the card has come home from. */
  deepest: ExpeditionTierKey | string;
}

/** Either a copy (`copy.card.trail`) or the card json itself
 *  (`card.trail`, as PlayerCard3D holds it). */
type WithTrail = { card?: { trail?: Partial<TrailStamp> | null } | null; trail?: Partial<TrailStamp> | null };

/** Miles walked, zero for a card that has never been out. */
export function milesOf(copy: WithTrail): number {
  const miles = copy.card ? copy.card.trail?.miles : copy.trail?.miles;
  return typeof miles === "number" && Number.isFinite(miles) && miles > 0 ? Math.floor(miles) : 0;
}

/** The highest title the miles have reached, or null. */
export function trailTitleFor(miles: number): TrailTitle | null {
  let best: TrailTitle | null = null;
  for (const title of TRAIL_TITLES) if (miles >= title.miles) best = title;
  return best;
}

export function trailTitleOf(copy: WithTrail): TrailTitle | null {
  return trailTitleFor(milesOf(copy));
}

export function isVeteran(copy: WithTrail): boolean {
  return milesOf(copy) >= VETERAN_MILES;
}

export function isWayfarer(copy: WithTrail): boolean {
  return milesOf(copy) >= WAYFARER_MILES;
}

/** The next title ahead of a card, and how far off it is — for the
 *  ledger's "12 miles · 4 to Veteran". Null once it holds the last. */
export function nextTrailTitle(miles: number): { title: TrailTitle; left: number } | null {
  const next = TRAIL_TITLES.find((title) => miles < title.miles);
  return next ? { title: next, left: next.miles - miles } : null;
}

/** "12 miles · Trailworn · 4 to Veteran", for a ledger line. */
export function trailLine(copy: WithTrail): string | null {
  const miles = milesOf(copy);
  if (miles === 0) return null;
  const title = trailTitleFor(miles);
  const next = nextTrailTitle(miles);
  return [`${miles} mile${miles === 1 ? "" : "s"}`, title?.label, next ? `${next.left} to ${next.title.label}` : null].filter(Boolean).join(" · ");
}
