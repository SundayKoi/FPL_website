// The edges the road reads (archetypes.ts), by the name the code calls
// them, and who in the squad makes a role call. Shared by the fork buttons
// (forkOptions.ts) and the resolver (resolveRoute.ts), so the page says
// what the claim will do from the same sheet.
//
// Part of routes.ts, which re-exports EDGE_TITLE; see the rules there.

import { FALLBACK_ARCHETYPE } from "@/lib/cards/build";
import { milesOf } from "./trail";
import { ARCHETYPE_RULES, activeAbilities } from "./archetypes";
import type { CardCopy } from "./config";

// === edges ===================================================================

/**
 * The titles the road reads (archetypes.ts), by the name the code calls
 * them. A title is a prose string on a frozen card; a typo here would be an
 * edge that quietly never fires, so routes.test.ts holds every value to a
 * key of ARCHETYPE_ABILITIES. The clocks, the reveals, Roam Enjoyer and
 * First Blood Merchant are not here: they change what the road IS, and
 * traitsOf reads them before a single fork is walked.
 */
export const EDGE_TITLE = {
  pentakill: "Pentakill Machine",
  heater: "On A Heater",
  glassCannon: "Glass Cannon",
  surgeon: "The Surgeon",
  highlight: "Highlight Reel",
  coinflip: "Coinflip Gamer",
  bornWinner: "Born Winner",
  clutch: "Clutch Gene",
  anchor: "The Anchor",
  veteran: "The Veteran",
  underdog: "The Underdog",
  ice: "Ice In The Veins",
  farmDemon: "Farm Demon",
  laneBully: "Lane Bully",
  goldHoarder: "Gold Hoarder",
  plate: "Plate Collector",
  wave: "Wave Manager",
  freeWin: "Free Win Lane",
  islandKing: "Island King",
  splitPusher: "Split Pusher",
  weakside: "Weakside Warrior",
  unkillable: "Unkillable",
  juggernaut: "The Juggernaut",
  powerFarmer: "Power Farmer",
  gank: "Gank Squad",
  counterJungler: "Counter Jungler",
  campThief: "Camp Thief",
  conductor: "Tempo Conductor",
  roamingThreat: "Roaming Threat",
  priorityMerchant: "Priority Merchant",
  burstMage: "Burst Mage",
  assassin: "The Assassin",
  hypercarry: "The Hypercarry",
  positioning: "Positioning God",
  lateGame: "Late Game Insurance",
  turret: "Turret Melter",
  silentCarry: "Silent Carry",
  bodyguard: "The Bodyguard",
  engage: "The Engage",
  lifeline: "The Lifeline",
  poke: "Poke Support",
  visionDenier: "Vision Denier",
  sacrificial: "Sacrificial Play",
  playmaker: "Playmaker",
  enabler: "The Enabler",
  frontline: "The Frontline",
  space: "Space Creator",
  duelist: "Duelist",
  executioner: "Executioner",
  skirmish: "Skirmish King",
  jack: FALLBACK_ARCHETYPE,
} as const;

export type EdgeTitle = (typeof EDGE_TITLE)[keyof typeof EDGE_TITLE];

/** The edges that take the hit for a squadmate: the first victim drawn is
 *  replaced by the front card, without a draw. Split Pusher is the front
 *  edge that does the opposite, and is read on its own. */
export const TAKERS: EdgeTitle[] = [EDGE_TITLE.juggernaut, EDGE_TITLE.bodyguard, EDGE_TITLE.sacrificial, EDGE_TITLE.frontline];

/** The edges that ignore a card's first harm. Unkillable ignores any; the
 *  other two a wound only. Each covers its own card. */
export const SHIELDS: EdgeTitle[] = [EDGE_TITLE.unkillable, EDGE_TITLE.anchor, EDGE_TITLE.bodyguard];

/** A percentage as the page prints one: 0.15 is "15". */
export const pctOf = (n: number): number => Math.round(n * 100);

/** Who counts, by title, under a run's rulebook: nothing below
 *  ARCHETYPE_RULES. Title → copy id. */
export function countedEdges(copies: Pick<CardCopy, "id" | "card">[], rules: number): Map<string, number> {
  return new Map(rules >= ARCHETYPE_RULES ? activeAbilities(copies).map((entry) => [entry.ability.title, entry.copyId] as const) : []);
}

// === who can make a call =====================================================

const roleOf = (copy: Pick<CardCopy, "role">): string => (copy.role ?? "").trim().toLowerCase();

/** The squad's members in a role, as printed on the card. */
export function inRole(copies: Pick<CardCopy, "role">[], role: string): Pick<CardCopy, "role">[] {
  return copies.filter((copy) => roleOf(copy) === role.toLowerCase());
}

/** The card that makes a role call: the squad's member in that role with
 *  the most miles, so a squad with two Junglers scouts with the one who
 *  has walked further. */
export function caller(copies: CardCopy[], role: string): CardCopy | undefined {
  return [...(inRole(copies, role) as CardCopy[])].sort((a, b) => milesOf(b) - milesOf(a))[0];
}
