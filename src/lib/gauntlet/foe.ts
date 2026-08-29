// The opponent's game plan — the part of the Gauntlet that thinks back.
//
// Until now the enemy was a stat block. Their side of every check was
// `teamAvg(theirs, keys)` plus a trait flat, identical whether they were
// ten thousand gold up or being run over, and identical whether you took
// the greedy line at the crossroads or the safe one. Nothing they did was
// a response to anything you did.
//
// This module gives them three kinds of response, under one hard rule:
//
//   THEY NEVER GET STRONGER, ONLY POINTED.
//
// Every adjustment here is a REALLOCATION that sums to zero. A plan that
// adds 3 points to the fight subtracts 3 across the beats it is giving
// up; collapsing on your weakest lane costs them exactly what they
// concede to your strongest; the desperation swing trades hold for
// objectives, point for point. So the bracket's difficulty curve — the
// one the Monte Carlo priced — does not move, while the FIGHT stops being
// the same fight every round. A smarter enemy should be beatable by a
// smarter player, not by a bigger collection.
//
// And every plan is PUBLIC. It is rolled off the week seed, stored on the
// opponent with the rest of the cast, and printed on the scouting card
// before you commit — with the line that beats it. A disposition you
// cannot see is not intelligence, it is a tax.

import type { MeasureKey } from "@/lib/cards/measures";
// Type-only: sim.ts imports this module, so a value import here would
// close the cycle.
import type { GauntletRole } from "./sim";

/** The beats a plan can weight. Every check in the match is one of these. */
export type FoeBeat = "lane" | "objective" | "fight" | "baron" | "hold" | "crossroads";

/**
 * What ONE raw stat point on each beat is actually worth, measured.
 *
 * This table is the reason the plans below are not round numbers. Counting
 * checks is the obvious way to balance a reallocation and it is wrong: the
 * lane phase is five checks but each lane moves momentum by four, while
 * the Baron pit is one check that moves it by nine and swings 1,500 gold.
 * The base hold barely matters at all — it is scaled by how close the game
 * still is, so most matches are decided before it.
 *
 * Measured by giving the opponent +1 on a single beat and running 48,000
 * matches at a 74-average lineup against the shipped bracket, rounds 1-8.
 * The number is the win rate the PLAYER loses, in points:
 *
 *   baron       1.081   one check, the most decisive in the game
 *   objective   0.910   three checks (herald 11, dragon 14, soul 23)
 *   fight       0.902   two checks (skirmish 18, pit fight 27)
 *   lane        0.844   five checks, and still worth less than the pit
 *   crossroads  0.250   one check, and the choice screen prices it
 *   hold        0.223   one check, and usually a formality by then
 *
 * Every reallocation in this file balances against THESE weights, not
 * against a count of checks, and a test holds the table to it. Re-measure
 * (foe.test.ts keeps the harness) if the sim's swings ever change.
 */
export const BEAT_VALUE: Record<FoeBeat, number> = {
  baron: 1.081,
  objective: 0.91,
  fight: 0.902,
  lane: 0.844,
  crossroads: 0.25,
  hold: 0.223,
};

/** How far off zero a plan's reallocation is allowed to land, in win-rate
 *  points. A tenth of a point is under the noise of any sample a league
 *  this size will ever produce. */
export const ZERO_SUM_TOLERANCE = 0.1;

/** What a plan is worth to the opponent, in win-rate points. Zero means
 *  pointed, not stronger — which is the whole contract. */
export function planValue(beats: Partial<Record<FoeBeat, number>>): number {
  let total = 0;
  for (const [beat, weight] of Object.entries(beats) as [FoeBeat, number][]) {
    total += weight * BEAT_VALUE[beat];
  }
  return total;
}

export type FoePlan = "objective" | "brawl" | "siege" | "pick";

export interface FoePlanDef {
  key: FoePlan;
  /** The scouting headline. */
  title: string;
  /** What they will do, in the player's language. */
  tell: string;
  /** How to beat it — the same contract every trait and condition keeps. */
  counter: string;
  /** Raw stat points added to their side, by beat. MUST sum to zero. */
  beats: Partial<Record<FoeBeat, number>>;
}

/**
 * Four dispositions, each a real trade. Read them as "what they spend
 * the game on, and what they let go of to do it".
 */
export const FOE_PLANS: FoePlanDef[] = [
  {
    key: "objective",
    title: "THE PIT IS THEIRS",
    tell: "They play the map. Every dragon and every Baron is contested hard, and they will give up a skirmish to get one.",
    counter: "Take the fighting lines. They are thin wherever the objective isn't.",
    beats: { objective: 1.5, baron: 2, fight: -2, lane: -2 },
  },
  {
    key: "brawl",
    title: "THEY WANT THE FIGHT",
    tell: "They look for the 5v5 at every opportunity and read a greedy call as an invitation.",
    counter: "Play the map instead. Objectives and turrets are where they are not looking.",
    beats: { fight: 2.5, crossroads: 2, objective: -2, hold: -4 },
  },
  {
    key: "siege",
    title: "THEY PLAY FOR TURRETS",
    tell: "Slow, structural, patient. They win lanes and grind buildings, and the base hold is where they are strongest.",
    counter: "End it early or take the pit — their late defence is bought with mid-game aggression.",
    beats: { hold: 4, lane: 1.5, fight: -1, baron: -1.2 },
  },
  {
    key: "pick",
    title: "THEY HUNT STRAGGLERS",
    tell: "They wait for someone to step wrong. The call at the crossroads is exactly the moment they are watching for.",
    counter: "Make the call you can afford to miss — and win lane, because a fed lane is not pickable.",
    beats: { crossroads: 3, lane: 1, objective: -1, fight: -0.75 },
  },
];

export const FOE_PLAN_BY_KEY = new Map(FOE_PLANS.map((plan) => [plan.key, plan]));


/** Rolls the disposition off the SAME seeded stream as the rest of the
 *  cast, so the whole league scouts the same opponent all week. */
export function rollFoePlan(rand: () => number): FoePlan {
  return FOE_PLANS[Math.min(FOE_PLANS.length - 1, Math.floor(rand() * FOE_PLANS.length))].key;
}

/** How hard they collapse on the lane that lost, in raw stat points —
 *  and, exactly as hard, how much ground they give the lane that won. */
export const FOCUS_FLAT = 2.2;

/** The margin a lane has to be decided by before it is worth pressing.
 *  Below this the lane was a coin flip and reading it as a weakness is
 *  the enemy hallucinating, not thinking. */
export const FOCUS_MARGIN = 8;

/**
 * The behind/ahead reallocation, balanced against BEAT_VALUE exactly like
 * a plan. Behind, they throw the base and stop taking straight fights to
 * force the map — the only comeback a losing team has. Ahead, the reverse:
 * they stop gambling on the pit and close on the base and in a 5v5.
 *
 * The lane phase is deliberately NOT part of this. It resolves at minute
 * eight, when the only thing that has moved momentum is the draft read —
 * which is never enough to cross either threshold, so a lane term here
 * would be a rule that reads well and never fires.
 */
export const SWING: Partial<Record<FoeBeat, number>> = {
  objective: 1.2,
  baron: 1.5,
  hold: -5,
  fight: -1.77,
};

/** Your momentum at which they consider themselves losing / winning. */
export const DESPERATE_AT = 60;
export const CLOSING_AT = 40;

/** The board as the opponent reads it at a given beat. */
export interface FoeBoard {
  /** YOUR momentum, 0-100. High means they are behind. */
  momentum: number;
  /** The lane they collapse on, and the one they refuse to walk into. */
  focusRole?: GauntletRole | null;
  fedRole?: GauntletRole | null;
  /** Whose beat this is, when the check belongs to one card. */
  role?: GauntletRole | null;
}

/** The lanes they read after the lane phase: worst loss and best win, and
 *  only when the margin was decisive enough to mean something. */
export function readLanes(
  lanes: { role: GauntletRole; won: boolean; margin: number }[],
): { focusRole: GauntletRole | null; fedRole: GauntletRole | null } {
  let worst: { role: GauntletRole; margin: number } | null = null;
  let best: { role: GauntletRole; margin: number } | null = null;
  for (const lane of lanes) {
    if (lane.margin <= -FOCUS_MARGIN && (!worst || lane.margin < worst.margin)) {
      worst = { role: lane.role, margin: lane.margin };
    }
    if (lane.margin >= FOCUS_MARGIN && (!best || lane.margin > best.margin)) {
      best = { role: lane.role, margin: lane.margin };
    }
  }
  return { focusRole: worst?.role ?? null, fedRole: best?.role ?? null };
}

/** Which beat a crossroads choice is, read off the side of the check they
 *  defend with. Derived rather than authored so a new situation can never
 *  forget to declare one. */
export function beatOfKeys(keys: MeasureKey[]): FoeBeat {
  if (keys.some((key) => key === "combat" || key === "damage")) return "fight";
  if (keys.some((key) => key === "turrets" || key === "survival")) return "hold";
  if (keys.some((key) => key === "objectives" || key === "vision")) return "objective";
  return "crossroads";
}

/**
 * Everything the opponent's brain adds to their side of one check.
 * Zero-sum by construction across a match: the plan's own weights sum to
 * zero, the lane read gives back what it takes, and the momentum swing is
 * a trade between two beats.
 */
export function foeEdge(plan: FoePlan | null | undefined, beat: FoeBeat, board: FoeBoard): number {
  let edge = 0;

  // ── The plan: what they spend the game on.
  if (plan) edge += FOE_PLAN_BY_KEY.get(plan)?.beats[beat] ?? 0;

  // ── The lane read: they collapse on the loser and avoid the winner.
  if (board.role) {
    if (board.role === board.focusRole) edge += FOCUS_FLAT;
    if (board.role === board.fedRole) edge -= FOCUS_FLAT;
  }

  // ── Desperation and closing: a trade, never a bonus.
  const swing = board.momentum >= DESPERATE_AT ? 1 : board.momentum <= CLOSING_AT ? -1 : 0;
  if (swing !== 0) edge += swing * (SWING[beat] ?? 0);

  return edge;
}

/**
 * Their side of the crossroads check. Two terms, and the second is the
 * whole point: a team that wants the fight is stronger when you take a
 * fighting line and weaker when you walk away from it, so the call at
 * minute 20 is a read on THEM and not only on your own stat sheet. The
 * tell is printed on the scouting card before you commit, which is what
 * separates a read from a gotcha.
 *
 * This is the one place the reallocation isn't zero-sum per check — it is
 * a genuine plus or minus depending on what you pick. What it does to the
 * bracket overall is measured, not asserted: see the Monte Carlo in
 * foe.test.ts.
 */
export function foeCrossroadsEdge(
  plan: FoePlan | null | undefined,
  theirKeys: MeasureKey[],
  board: FoeBoard,
): number {
  const anticipation = plan ? (FOE_PLAN_BY_KEY.get(plan)?.beats.crossroads ?? 0) : 0;
  const beat = beatOfKeys(theirKeys);
  // A line they defend with nothing in particular reads as "crossroads"
  // already — counting the anticipation twice would price it as two
  // reads of the same tell.
  return beat === "crossroads" ? anticipation : anticipation + foeEdge(plan, beat, board);
}

/** The one-line read the match tape prints when the plan first shows —
 *  the enemy stating its intention, so a player who skipped the scouting
 *  card still gets told. */
export function foePlanEvent(plan: FoePlan | null | undefined): { text: string; detail: string } | null {
  const def = plan ? FOE_PLAN_BY_KEY.get(plan) : null;
  if (!def) return null;
  return { text: `Their game plan: ${def.title}`, detail: def.tell };
}
