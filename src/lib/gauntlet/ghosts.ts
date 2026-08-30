// Ghosts: last week's runs, standing in this week's bracket.
//
// The Gauntlet's opponents used to be invented. Now they are people —
// the run someone posted last week, with their five, their build, and
// the calls they actually made, waiting in the round they reached. Beat
// it and you beat THEM; post a run of your own and the whole league has
// to get past you next week.
//
// Two rules make that work without turning the mode into a lottery.
//
//   THE CAST IS REAL, THE LEVEL IS THE BRACKET'S.
// Real lineups do not follow a difficulty curve: a deep collection posts
// an 85-average run in round 1 and a thin shelf reaches round 8 at 68.
// Dropped in raw, the bracket would be decided by who happened to be in
// it. So a ghost's five are SHIFTED onto bracketTarget — the same number
// the generated opponent was always priced at — preserving every card's
// and every stat's distance from their own team mean. Their poke comp
// stays a poke comp, their carry stays the carry, their weak lane stays
// weak. Only the absolute power comes from the round.
//
//   THEY DEFEND WITH THE BUILD, NOT WITH THE SCOREBOARD.
// A relic that wins fights defends. A relic that pays score, marks fresh
// cards, or buys a bench swap does not — those are about running a run,
// not about winning a game, and a defender is not running anything.
//
// Everything in this file is pure. Which ghost stands in which round is a
// database question, and it lives in ghostQueries.ts.

import type { MeasureKey } from "@/lib/cards/measures";
import type { FoePlan } from "./foe";
import { RELIC_BY_KEY } from "./relics";
import type { TraitEffects } from "./traits";
import type { GauntletCard } from "./sim";

/** What the run row and the round log know about a ghost, together. */
export interface GhostBrief {
  runId: number;
  /** Who posted it. Printed on the scouting card — this is a league. */
  name: string;
  /** Their frozen five, at their own ratings. */
  lineup: GauntletCard[];
  /** Their raw lineup average, before the bracket shift. */
  lineupAvg: number;
  /** The relics they held IN the round being stood in. */
  relics: string[];
  /** The call they made at that round's crossroads, if they made one. */
  choiceKey: string | null;
  /** The round of theirs you are standing in. */
  round: number;
  /** What their whole run scored — the scouting card's bragging line. */
  score: number;
  /** One of last week's top finishers. Beating them pays BOUNTY_MULT. */
  bounty: boolean;
}

/**
 * How much of a defender's build actually reaches the fight.
 *
 * A ghost standing in round 8 held seven relics when they got there, and
 * a ghost in round 1 held none — a difficulty ramp that arrives free with
 * the design and lands ON TOP of the bracket's own ramp. This scalar is
 * what keeps the two from compounding into an unclearable round 8. It is
 * MEASURED, not chosen: see the calibration test in ghosts.test.ts, which
 * holds the mode to the same clear-rate band it shipped with.
 */
export const GHOST_RELIC_POTENCY = 0.35;

/**
 * What the bracket gives back for standing a real run in the round.
 *
 * A ghost is not just a five: it is a five with a real SHAPE (a fed lane
 * and a weak one, not a flat block), a build, and a decision at minute
 * 20. Measured against the generated bracket on the same harness, those
 * three together are worth far more than the traits an invented team
 * wears — a ghost round priced at the same target cleared at a third of
 * the rate. So the round prices a ghost's five a little lower, exactly as
 * a boss round prices its five a little higher, and the ramp the mode
 * shipped with survives the change of opponent.
 *
 * Solved for, not chosen: see the calibration in ghosts.test.ts.
 */
export const GHOST_TARGET_RELIEF = 2;

/** The lowest and highest a shifted card may land, matching the
 *  generator's own clamps so a ghost can never be off the scale. */
const OVERALL_FLOOR = 40;
const OVERALL_CEIL = 95;
const STAT_FLOOR = 20;
const STAT_CEIL = 99;

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));

/** A team's mean overall — the anchor the shift is measured from. */
export function teamMean(cards: GauntletCard[]): number {
  if (cards.length === 0) return 0;
  return cards.reduce((sum, card) => sum + card.overall, 0) / cards.length;
}

/**
 * The ghost, priced to the round. A SHIFT, deliberately, not a scale:
 * multiplying would squash a spiky lineup toward flat and stretch a flat
 * one into spikes, which is precisely the shape information worth
 * keeping. Adding preserves every deviation exactly.
 */
export function normalizeGhost(cards: GauntletCard[], targetAvg: number): GauntletCard[] {
  if (cards.length === 0) return cards;
  const shift = targetAvg - teamMean(cards);
  return cards.map((card) => {
    const stats: Partial<Record<MeasureKey, number>> = {};
    for (const [key, value] of Object.entries(card.stats) as [MeasureKey, number][]) {
      stats[key] = clamp(Math.round(value + shift), STAT_FLOOR, STAT_CEIL);
    }
    return {
      ...card,
      overall: clamp(Math.round(card.overall + shift), OVERALL_FLOOR, OVERALL_CEIL),
      stats,
      // A ghost is a memory of a card, not the card. Nobody's foil is
      // fighting for them, and Fresh Legs belongs to the week it printed.
      foil: false,
      signed: false,
      fresh: false,
      inventoryId: null,
    };
  });
}

/**
 * A defender's relics, on the defending side of the checks.
 *
 * Only the dials with an honest mirror cross over. The rest are about
 * running a run — score, style, the bench swap, what a landed call pays —
 * and a ghost is not running anything, so they are deliberately dropped
 * rather than approximated into a number nobody can reason about.
 */
export function ghostTraitEffects(relicKeys: string[], potency = GHOST_RELIC_POTENCY): TraitEffects {
  const out: TraitEffects = {};
  let goldMult = 1;
  for (const key of relicKeys) {
    const fx = RELIC_BY_KEY.get(key)?.effects;
    if (!fx) continue;
    if (fx.fightFlat) out.fightFlat = (out.fightFlat ?? 0) + fx.fightFlat * potency;
    if (fx.earlyFightBonus) out.earlyFlat = (out.earlyFlat ?? 0) + fx.earlyFightBonus * potency;
    if (fx.lanesFlat) out.lanesFlat = (out.lanesFlat ?? 0) + fx.lanesFlat * potency;
    if (fx.objectivesFlat) out.objectivesFlat = (out.objectivesFlat ?? 0) + fx.objectivesFlat * potency;
    if (fx.holdFlat) out.holdFlat = (out.holdFlat ?? 0) + fx.holdFlat * potency;
    if (fx.crossroadsBonus) out.crossroadsFlat = (out.crossroadsFlat ?? 0) + fx.crossroadsBonus * potency;
    // A comeback dial defends the same way it attacks: it is help when
    // the holder is losing, which for a defender is when YOU are ahead.
    if (fx.comebackFlat) out.comebackFlat = (out.comebackFlat ?? 0) + fx.comebackFlat * potency;
    // Multipliers compound, exactly as they do on your side.
    if (fx.goldMult) goldMult *= fx.goldMult;
  }
  if (goldMult !== 1) out.goldMult = 1 + (goldMult - 1) * potency;
  return out;
}

/** Which relic dials read as which disposition. A build IS a game plan —
 *  a ghost's tell isn't rolled, it is what they actually assembled. */
const PLAN_SIGNAL: Record<FoePlan, (keyof import("./relics").RelicEffects)[]> = {
  brawl: ["fightFlat", "earlyFightBonus"],
  objective: ["objectivesFlat", "baronBurnMult", "baronWindowFlat"],
  siege: ["holdFlat", "lanesFlat", "laneMomentumMult"],
  pick: ["crossroadsBonus", "daringMult"],
};

/**
 * The disposition a ghost's build states. Rolled plans are a die; a
 * ghost's is a reading of what they spent seven picks on, which is why
 * the scouting card can say "their build says they want the fight" and
 * be telling the literal truth.
 */
export function ghostPlanOf(relicKeys: string[]): FoePlan | undefined {
  const scores: Record<string, number> = { brawl: 0, objective: 0, siege: 0, pick: 0 };
  for (const key of relicKeys) {
    const fx = RELIC_BY_KEY.get(key)?.effects;
    if (!fx) continue;
    for (const [plan, signals] of Object.entries(PLAN_SIGNAL) as [FoePlan, string[]][]) {
      for (const signal of signals) {
        const value = (fx as Record<string, number | boolean | undefined>)[signal];
        if (typeof value !== "number") continue;
        // A multiplier's signal is its distance from 1; a flat's is itself.
        scores[plan] += signal.endsWith("Mult") ? (value - 1) * 10 : value;
      }
    }
  }
  let best: FoePlan | undefined;
  let top = 0;
  for (const [plan, score] of Object.entries(scores) as [FoePlan, number][]) {
    if (score > top) {
      top = score;
      best = plan;
    }
  }
  // A build with nothing to say gets no plan rather than a made-up one.
  return best;
}

/** A round-log row as the ghost chooser reads it. */
export interface GhostCandidate {
  runId: number;
  round: number;
  relics: string[];
  choiceKey: string | null;
  /** Total ordering key — the log's own id, so the pick is stable. */
  id: number;
}

/** How many of last week's top runs stand in the pool as BOUNTIES, and
 *  what beating one is worth.
 *
 *  This is the leaderboard's skill target. You cannot farm it: which
 *  eight you meet is a private draw, so meeting a bounty is luck and
 *  beating one is not — and unlike a lucky score roll, it cannot be
 *  re-rolled into existence by playing more, because the multiplier is
 *  on a fight you still have to win. */
export const BOUNTY_COUNT = 3;
export const BOUNTY_MULT = 1.5;

/** Last week's best runs — one per player, so a grinder who posted the
 *  top four scores does not become the entire bounty board. */
export function bountiesIn(runs: Map<number, GhostRun>): Set<number> {
  const bestPerPlayer = new Map<string, GhostRun>();
  for (const run of runs.values()) {
    const held = bestPerPlayer.get(run.discordId);
    if (!held || run.score > held.score) bestPerPlayer.set(run.discordId, run);
  }
  return new Set(
    [...bestPerPlayer.values()]
      .sort((a, b) => b.score - a.score || a.id - b.id)
      .slice(0, BOUNTY_COUNT)
      .map((run) => run.id),
  );
}

/**
 * Whether two lineups are the same five cards.
 *
 * A re-run should be a DIFFERENT run, not the same run rolled again. The
 * leaderboard takes your best score, so identical re-entries are just
 * extra dice; making the collection move by at least one card means every
 * attempt is a new attempt. It also asks something of the shelf beyond
 * its best five, which is the point of fielding a collection at all.
 *
 * Compared as a SET of inventory ids: swapping which role a card is
 * assigned to is not a new lineup, and order never mattered. A trialist
 * (no inventory id) is a hole, and two lineups with holes in the same
 * roles are still the same lineup.
 */
export function sameLineup(a: GauntletCard[], b: GauntletCard[]): boolean {
  if (a.length !== b.length) return false;
  const key = (cards: GauntletCard[]) =>
    cards
      .map((card) => (card.inventoryId === null ? `trialist:${card.role}` : String(card.inventoryId)))
      .sort()
      .join("|");
  return key(a) === key(b);
}

/** A run row as the ghost chooser reads it. */
export interface GhostRun {
  id: number;
  discordId: string;
  lineup: GauntletCard[];
  lineupAvg: number;
  score: number;
}

/**
 * Who stands in which round.
 *
 * One pass, seeded, deduplicated: round 1 picks first, round 8 last, and
 * nobody appears twice — eight rounds against the same person would be a
 * strange week. Rounds with no candidate left are simply absent and the
 * caller falls back to a generated team, which is what makes the first
 * week of a season (and any quiet one) work at all.
 *
 * Pure: `seedFor` is the week+round hash, so the whole league meets the
 * same eight people in the same order.
 */
export function chooseGhosts(
  candidates: GhostCandidate[],
  runs: Map<number, GhostRun>,
  names: Map<string, string>,
  seedFor: (round: number) => number,
  rounds: number[],
  bounties: ReadonlySet<number> = new Set(),
): Map<number, GhostBrief> {
  const chosen = new Map<number, GhostBrief>();
  const spent = new Set<number>();
  for (const round of rounds) {
    const pool = candidates
      .filter((row) => row.round === round && !spent.has(row.runId) && runs.has(row.runId))
      // A total order, so the seeded index means the same thing on every
      // machine and every reload.
      .sort((a, b) => a.id - b.id);
    if (pool.length === 0) continue;
    const pick = pool[Math.abs(Math.trunc(seedFor(round))) % pool.length];
    const run = runs.get(pick.runId)!;
    spent.add(pick.runId);
    chosen.set(round, {
      runId: run.id,
      name: names.get(run.discordId) ?? "A challenger",
      lineup: run.lineup,
      lineupAvg: run.lineupAvg,
      relics: pick.relics,
      choiceKey: pick.choiceKey,
      round,
      score: run.score,
      bounty: bounties.has(run.id),
    });
  }
  return chosen;
}
