// Opponent generation: the bracket the run climbs.
//
// Enemy teams are invented characters, not stat bags — themed name banks
// per comp style so "Iron Vanguard" reads as a diver before the numbers
// do. Difficulty scales off the PLAYER'S lineup average (raw overalls, no
// Fresh Legs — the bonus is an edge, the bracket is fair), climbing about
// a point and a half per round so round 8 is a real wall.

import {
  type CompStyle,
  type GauntletCard,
  type GauntletRole,
  GAUNTLET_ROLES,
} from "./sim";
import { rollCondition, rollTraits } from "./traits";
import type { MeasureKey } from "@/lib/cards/measures";

const clamp = (value: number, lo: number, hi: number): number => Math.max(lo, Math.min(hi, value));

/** Per-style name banks, one name per role slot draw. */
const NAME_BANKS: Record<CompStyle, string[]> = {
  dive: ["Iron Vanguard", "Pit Stalker", "Hex Adept", "Grave Shot", "Wall Keeper", "Blood Sworn", "Gate Crasher", "The Hinge"],
  poke: ["Long Arm", "Sky Splitter", "The Metronome", "Glass Sniper", "Arc Light", "Slow Burn", "The Surveyor", "Rain Maker"],
  protect: ["The Warden", "Still Water", "Ivory Line", "The Shepherd", "Low Tide", "Stone Court", "The Curtain", "Night Nurse"],
};

/** Which bars a style's five run hot vs cold — the stat shape that makes
 *  compStyleOf read the generated team as its intended identity. */
const STYLE_SHAPE: Record<CompStyle, { hot: MeasureKey[]; cold: MeasureKey[] }> = {
  poke: { hot: ["damage", "laning"], cold: ["survival", "presence"] },
  dive: { hot: ["combat", "presence"], cold: ["vision", "laning"] },
  protect: { hot: ["survival", "vision"], cold: ["damage", "economy"] },
};

/** Every bar the generator writes — the union the cards' roles wear. */
const ALL_KEYS: MeasureKey[] = [
  "combat", "damage", "economy", "laning", "vision", "objectives", "turrets", "survival", "presence", "impact",
];

export interface OpponentTeam {
  cards: GauntletCard[];
  style: CompStyle;
  avg: number;
  /** "DIVE COMP · 74 AVG" — the scouting line. */
  label: string;
  /** Trait keys this team wears — read them before you commit. */
  traits?: string[];
  /** The round's condition key — the rules both sides play under. */
  condition?: string;
}

/** The reference lineup the bracket is priced against — roughly what a
 *  season's shelf produces once a player owns a card per role. */
export const LEAGUE_BASELINE = 74;

/** How much of the bracket follows YOUR five rather than the league's
 *  baseline. At 1.0 the bracket tracks you exactly and your collection is
 *  worth literally nothing (v3 shipped this way: a 65-average lineup and
 *  an 82-average lineup measured identical curves, which is a strange
 *  thing for a card game). At 0 a thin shelf is unplayable. 0.88 leaves a
 *  ten-point lineup edge worth about a point and a bit — felt, never
 *  decisive, and small enough that SHAPE (commitment and chemistry, see
 *  lineupShapeOf) still out-earns raw overall. */
const LINEUP_TRACKING = 0.88;

/** The bracket's target average for a round. Round 1 sits well under a
 *  typical five, a warm-up you clear most of the time; round 8 sits over
 *  it and is reached by under a tenth of runs. The wall is the CHAIN, not
 *  any single fight.
 *
 *  Difficulty lives here and nowhere else — traits are shapes, conditions
 *  are rules. Monte-Carlo pins the curve (see sim.test's calibration
 *  band); anything that moves it is a rebalance, not a refactor. */
export function bracketTarget(lineupAvg: number, round: number): number {
  const priced = LINEUP_TRACKING * lineupAvg + (1 - LINEUP_TRACKING) * LEAGUE_BASELINE;
  return clamp(Math.round(priced - 10 + round * 2.0), 45, 92);
}

/**
 * One generated enemy team, seeded. Names draw without replacement from
 * the style's bank; stats sample around the target with the style's shape
 * pushed hot and cold, so the team plays like what it's called.
 */
export function generateOpponent(lineupAvg: number, round: number, rand: () => number): OpponentTeam {
  const styles: CompStyle[] = ["poke", "dive", "protect"];
  const style = styles[Math.min(2, Math.floor(rand() * 3))];
  const target = bracketTarget(lineupAvg, round);
  const shape = STYLE_SHAPE[style];

  const bank = [...NAME_BANKS[style]];
  const cards: GauntletCard[] = GAUNTLET_ROLES.map((role: GauntletRole) => {
    const nameIndex = Math.min(bank.length - 1, Math.floor(rand() * bank.length));
    const name = bank.splice(nameIndex, 1)[0] ?? `${style} ${role}`;
    const overall = clamp(Math.round(target + (rand() - 0.5) * 10), 40, 95);
    const stats: Partial<Record<MeasureKey, number>> = {};
    for (const key of ALL_KEYS) {
      const hot = shape.hot.includes(key) ? 8 : 0;
      const cold = shape.cold.includes(key) ? -8 : 0;
      stats[key] = clamp(Math.round(overall + hot + cold + (rand() - 0.5) * 12), 20, 99);
    }
    return { inventoryId: null, name, role, overall, stats, foil: false, signed: false, fresh: false };
  });

  const avg = Math.round(cards.reduce((sum, card) => sum + card.overall, 0) / cards.length);
  // Traits and the round's condition come off the SAME seeded stream, so
  // the scouting screen and the fight always agree.
  const traits = rollTraits(round, rand);
  const condition = rollCondition(round, rand);
  return { cards, style, avg, label: `${style.toUpperCase()} COMP · ${avg} AVG`, traits, condition };
}
