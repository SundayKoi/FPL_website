// Opponent generation: the bracket the run climbs.
//
// Enemy teams are invented characters, not stat bags — themed name banks
// per comp style so "Iron Vanguard" reads as a diver before the numbers
// do. Difficulty scales off the PLAYER'S lineup average (raw overalls, no
// Fresh Legs — the bonus is an edge, the bracket is fair), climbing about
// a point and a half per round so round 8 is a real wall.

import {
  type CompStyle,
  compStyleOf,
  type GauntletCard,
  type GauntletRole,
  GAUNTLET_ROLES,
} from "./sim";
import { type GhostBrief, ghostPlanOf, normalizeGhost, teamMean } from "./ghosts";
import { bossFor } from "./bosses";
import { ascensionRules } from "./ascension";
import { rollCondition, rollTraits } from "./traits";
import { type FoePlan, rollFoePlan } from "./foe";
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

/** A stable 32-bit seed from the week and the round.
 *
 *  THE POINT: the opponent a player meets in round 3 this week is the
 *  same character, wearing the same traits, under the same patch, as the
 *  one everybody else meets — so the weekly board compares runs against a
 *  shared bracket instead of eight private dice. Only the enemy's RATINGS
 *  still scale to your own five (bracketTarget), because a shared bracket
 *  that ignores your shelf would just be an unfair one. The FIGHT keeps
 *  its own CSPRNG seed: the cast is public, the dice are not. */
export function weekSeed(weekStart: string, round: number): number {
  let hash = 0x811c9dc5;
  const key = `${weekStart}#${round}`;
  for (let i = 0; i < key.length; i += 1) {
    hash ^= key.charCodeAt(i);
    hash = Math.imul(hash, 0x01000193);
  }
  return hash >>> 0;
}

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
  /** The wall's key on rounds 4 and 8 — null everywhere else. */
  boss?: string | null;
  /** How they intend to play it — printed on the scouting card before
   *  you commit, and read by the engine at every beat. Absent on rows
   *  staged before the plan shipped: those fight the old flat way. */
  plan?: FoePlan;
  /** Set when this "team" is a REAL RUN from last week rather than an
   *  invention. Their five have already been shifted onto the round's
   *  bracket target — the cast is real, the level is the bracket's — and
   *  what stays theirs is the shape, the build and the call. */
  ghost?: GhostFace;
}

/** The human half of a ghost: who it was, and what they brought. */
export interface GhostFace {
  runId: number;
  /** Who posted the run. This is a league; the opponent has a name. */
  name: string;
  /** What their whole run scored — the scouting card's bragging line. */
  score: number;
  /** Their raw lineup average BEFORE the bracket shift, so the scouting
   *  card can be honest about whose shelf this really was. */
  trueAvg: number;
  /** The relics they held in the round you are standing in. */
  relics: string[];
  /** The call they made here. Shown before you make yours — answering a
   *  real decision is the entire point of the mode. */
  choiceKey: string | null;
  /** One of last week's top finishers, standing in the pool marked. */
  bounty?: boolean;
}

/** What a wall adds to its five's ratings on top of its rule. */
export const BOSS_RATING_BUMP = 1.5;

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
  return clamp(Math.round(priced - 10 + round * 2.15), 45, 92);
}

/**
 * The rules of the round: the wall standing in it, the patch it is played
 * under, and the traits whoever turns up will wear.
 *
 * All three are drawn FIRST, off the front of the stream, so they are
 * identical whether a person or an invention is standing in the round.
 * The division of labour is the point:
 *
 *   THE ROUND brings the wall, the patch and the traits — this is where
 *   the difficulty ramp lives, and it must not depend on who happened to
 *   post a run last week.
 *   WHOEVER STANDS IN IT brings the five, the build and the call.
 *
 * Ghosts wearing the round's traits is what keeps the bracket honest. The
 * first version left them off — a ghost's build is their trait, went the
 * reasoning — and measured a blind clear rate of 8.2% against the AI
 * bracket's 0.7%, because traits are most of a round's difficulty budget
 * and round 1's ghost has no relics at all to replace them with.
 */
export function roundRules(round: number, rand: () => number, ascension = 0) {
  const boss = bossFor(round, rand, ascension);
  const condition = rollCondition(round, rand);
  const traits = rollTraits(round, rand);
  return { boss, condition, traits };
}

/**
 * A real run, dressed as this round's opponent.
 *
 * Their five are SHIFTED onto the same bracketTarget the generator was
 * always priced at, preserving every card's and every stat's distance
 * from their own team mean — so the shape is entirely theirs and only the
 * level is the round's. Traits are empty on purpose: a ghost's trait IS
 * their build, and it reaches the fight through ghostTraitEffects.
 */
export function ghostOpponent(
  ghost: GhostBrief,
  lineupAvg: number,
  round: number,
  /** The round's condition and wall still apply — they are the rules of
   *  the round, not a property of who is standing in it. */
  rand: () => number,
  /** The run's ascension: where the walls stand, what a ghost's five are
   *  priced at, and the flat bump on the bracket. */
  ascension = 0,
): OpponentTeam {
  const rules = ascensionRules(ascension);
  const { boss, condition, traits } = roundRules(round, rand, ascension);
  const target = bracketTarget(lineupAvg, round) + (boss ? BOSS_RATING_BUMP : 0) - rules.ghostRelief + rules.bracketBump;
  const cards = normalizeGhost(ghost.lineup, target);
  const avg = cards.length > 0 ? Math.round(teamMean(cards)) : target;
  const style = compStyleOf(cards);
  return {
    cards,
    style,
    avg,
    label: [
      ghost.bounty ? "★ BOUNTY" : null,
      boss ? boss.title : null,
      ghost.name.toUpperCase(),
      `${style.toUpperCase()} COMP`,
      `${avg} AVG`,
    ].filter(Boolean).join(" · "),
    traits,
    condition,
    boss: boss?.key ?? null,
    plan: ghostPlanOf(ghost.relics),
    ghost: {
      runId: ghost.runId,
      name: ghost.name,
      score: ghost.score,
      trueAvg: Math.round(ghost.lineupAvg),
      relics: ghost.relics,
      choiceKey: ghost.choiceKey,
      bounty: ghost.bounty,
    },
  };
}

/**
 * One generated enemy team, seeded. Names draw without replacement from
 * the style's bank; stats sample around the target with the style's shape
 * pushed hot and cold, so the team plays like what it's called.
 */
export function generateOpponent(lineupAvg: number, round: number, rand: () => number, ascension = 0): OpponentTeam {
  // The round's rules come off the front of the stream, before anything
  // about the team, so a ghost round and a generated round play under the
  // same patch behind the same wall.
  //
  // A boss round is fought by a NAMED wall, not another anonymous five.
  // The rule is what makes it memorable; the small rating bump is what
  // makes the round read as a WALL on the way past — a boss that is only
  // a rule disappears into the ramp, and one that is only a bump teaches
  // nothing. Both, and neither alone.
  const { boss, condition, traits } = roundRules(round, rand, ascension);
  const bossBump = boss ? BOSS_RATING_BUMP : 0;

  const styles: CompStyle[] = ["poke", "dive", "protect"];
  const style = styles[Math.min(2, Math.floor(rand() * 3))];
  const target = bracketTarget(lineupAvg, round) + ascensionRules(ascension).bracketBump;
  const shape = STYLE_SHAPE[style];

  const bank = [...NAME_BANKS[style]];
  const cards: GauntletCard[] = GAUNTLET_ROLES.map((role: GauntletRole) => {
    const nameIndex = Math.min(bank.length - 1, Math.floor(rand() * bank.length));
    const name = bank.splice(nameIndex, 1)[0] ?? `${style} ${role}`;
    const overall = clamp(Math.round(target + bossBump + (rand() - 0.5) * 10), 40, 95);
    const stats: Partial<Record<MeasureKey, number>> = {};
    for (const key of ALL_KEYS) {
      const hot = shape.hot.includes(key) ? 8 : 0;
      const cold = shape.cold.includes(key) ? -8 : 0;
      stats[key] = clamp(Math.round(overall + hot + cold + (rand() - 0.5) * 12), 20, 99);
    }
    return { inventoryId: null, name, role, overall, stats, foil: false, signed: false, fresh: false };
  });

  const avg = Math.round(cards.reduce((sum, card) => sum + card.overall, 0) / cards.length);
  // Drawn LAST so adding the plan didn't re-roll every existing week's
  // cast: the five, their traits and the condition come off the same
  // prefix of the stream they always did.
  const plan = rollFoePlan(rand);
  return {
    cards,
    style,
    avg,
    label: boss
      ? `${boss.title} · ${style.toUpperCase()} COMP · ${avg} AVG`
      : `${style.toUpperCase()} COMP · ${avg} AVG`,
    traits,
    condition,
    boss: boss?.key ?? null,
    plan,
  };
}
