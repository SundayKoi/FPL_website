// Ascension: the ladder above a clear.
//
// Clear all eight rounds at your current ascension and the next level
// unlocks for the rest of the season. Each level is a NAMED rule change,
// cumulative like the levels before it, printed on the draft screen and
// in the rulebook — never a quiet +10. The board and the purse weigh a
// run by the level it was played at, so climbing difficulty is how you
// win Monday rather than grinding variance at level zero.
//
// Everything here is pure. The engine reads `ascensionRules(level)`; the
// database keeps `gauntlet_ascension` (what each player has unlocked, per
// season) and stamps every run with the level it was fought at.

import { GHOST_RELIC_POTENCY, GHOST_TARGET_RELIEF } from "./ghosts";

/** The top of the ladder this season. */
export const ASCENSION_MAX = 5;

/** What each level adds to a run's board score: 10% per level. */
export const ASCENSION_SCORE_STEP = 0.1;

/** What each level adds to the purse: 10% per level. */
export const ASCENSION_PURSE_STEP = 0.1;

export interface AscensionLevel {
  level: number;
  title: string;
  /** The rule, in one line. */
  rule: string;
  /** How to play into it. */
  counter: string;
}

export const ASCENSION_LEVELS: AscensionLevel[] = [
  {
    level: 1,
    title: "THE LONG WALL",
    rule: "Walls stand at rounds 3, 6 and 8 — three of them, not two.",
    counter: "The gate comes a round early and again at six. Build for the wall you can see, not the round after it.",
  },
  {
    level: 2,
    title: "FULL STRENGTH",
    rule: "Ghosts defend with their whole build, and their five are priced at the round, not under it.",
    counter: "Read their relics on the scouting card like they are yours — at full potency they are.",
  },
  {
    level: 3,
    title: "TWO OF THREE",
    rule: "A relic offer is two cards, not three.",
    counter: "Fewer ways out of a bad family. Commit earlier, or take the wildcard when it shows.",
  },
  {
    level: 4,
    title: "NO SLACK",
    rule: "Every opponent's five is priced 3 higher, every round.",
    counter: "A ten-point lineup edge is worth about a point of bracket. This is three of those. Shape pays more than ever.",
  },
  {
    level: 5,
    title: "THEIR PIT",
    rule: "The Baron pit is theirs whatever the scoreboard or your call says — the Pit King's rule, every round.",
    counter: "You cannot start the pit. Win it as a contest: vision against their presence, and bring the smite edge.",
  },
];

/** The rules the engine reads for a level. Cumulative: level 3 carries
 *  levels 1 and 2. Level 0 is the Gauntlet as it shipped. */
export interface AscensionRules {
  level: number;
  /** Where the gate walls stand (the final wall is always round 8). */
  gateRounds: number[];
  /** How much of a ghost's build defends. */
  ghostPotency: number;
  /** What a ghost's five are priced under the round's target. */
  ghostRelief: number;
  /** How many relics an offer holds. */
  offerSize: number;
  /** Added to every opponent's bracket target. */
  bracketBump: number;
  /** They hold the Baron pit, every round. */
  holdsPit: boolean;
}

export function ascensionRules(level: number): AscensionRules {
  const at = clampAscension(level, ASCENSION_MAX);
  return {
    level: at,
    gateRounds: at >= 1 ? [3, 6] : [4],
    ghostPotency: at >= 2 ? 1 : GHOST_RELIC_POTENCY,
    ghostRelief: at >= 2 ? 0 : GHOST_TARGET_RELIEF,
    offerSize: at >= 3 ? 2 : 3,
    bracketBump: at >= 4 ? 3 : 0,
    holdsPit: at >= 5,
  };
}

/** A level as the database accepts it: an integer in [0, unlocked]. */
export function clampAscension(level: number, unlocked: number): number {
  const wanted = Number.isFinite(level) ? Math.floor(level) : 0;
  return Math.max(0, Math.min(Math.min(ASCENSION_MAX, Math.max(0, Math.floor(unlocked))), wanted));
}

/** A run's score as the board weighs it: 10% more per level. */
export function weightedScore(score: number, level: number): number {
  return Math.round(score * (1 + ASCENSION_SCORE_STEP * clampAscension(level, ASCENSION_MAX)));
}

/** What a level multiplies the purse by. */
export function ascensionPurseMult(level: number): number {
  return 1 + ASCENSION_PURSE_STEP * clampAscension(level, ASCENSION_MAX);
}

/** The level a clear at `level` unlocks — one higher, never past the top. */
export function unlockedByClear(level: number): number {
  return Math.min(ASCENSION_MAX, clampAscension(level, ASCENSION_MAX) + 1);
}

/** "A3" — the badge beside a name on the board. Empty at level 0. */
export function ascensionBadge(level: number): string {
  return level > 0 ? `A${level}` : "";
}
