// The crossroads — the mid-game decision that makes a fight a GAME.
//
// At minute 20 the sim pauses on a situation picked by the scoreboard
// (ahead, even, or desperate) and hands the player three calls. Every
// call is an open-book check: WHICH of your stats it rolls, which of
// theirs it rolls against, and what's staked either way are all in the
// catalog — the UI prints the real numbers.
//
// THE THING THAT MAKES IT A DECISION: printing the odds is not enough.
// If the call you're best at is also the call that pays best, there is
// no decision — you just read the biggest number and click it. So two
// rules hold this catalog together:
//
//   1. DARING PAYS BY RISK, NOT BY STAT. The score a landed call pays is
//      scaled by the odds you took it at (daringAt): a coin flip pays the
//      listed number, a sure thing pays a fraction of it, a long shot
//      pays up to double. Taking the call you're best at is a legitimate
//      way to SURVIVE and a bad way to SCORE — and the board is scored.
//   2. EVERY CALL SHAPES A DIFFERENT SECOND HALF. Each one carries a
//      consequence: who starts the Baron pit, what your fight is worth
//      afterwards, whether your base holds. So the question is "which
//      second half do I want", not "which number is bigger".
//
// Same purity rules as the sim: resolution is a function of (state,
// choice, seed).

import type { MeasureKey } from "@/lib/cards/measures";
import type { ConditionEffects } from "./traits";

/** What a call does to your side for the REST of the match. */
export interface CrossroadsSpoils {
  /** Your side of both remaining fights. */
  fightFlat?: number;
  /** Your side of the base hold. */
  holdFlat?: number;
  /** Your side of the soul dragon and the Baron smite. */
  objectivesFlat?: number;
  /** One-off gold, signed for your side. */
  gold?: number;
  /** Who holds the pit at 25:00 after this outcome. Unset leaves it to
   *  the scoreboard. Crucially this sits INSIDE the outcome: calling the
   *  Baron and missing hands them the pit, which is what stops "always
   *  gamble" from being free. */
  pit?: "yours" | "theirs";
}

export interface CrossroadsConsequence {
  /** The plain-language line the choice card prints. */
  note: string;
  /** Applied when the call LANDS (and always, for a no-roll call). */
  onWin?: CrossroadsSpoils;
  /** Applied when it FAILS — a gamble that costs nothing isn't one. */
  onFail?: CrossroadsSpoils;
}

export interface CrossroadsChoice {
  key: string;
  label: string;
  /** What you're actually doing, in the player's language. */
  description: string;
  /** Your side of the check — averaged over the team. Empty = no roll:
   *  the safe play, it just takes its swing. */
  yourKeys: MeasureKey[];
  /** Their side. Empty with yourKeys empty = automatic. */
  theirKeys: MeasureKey[];
  /** Flat help your side gets on this check (relic hooks add more). */
  bonus: number;
  /** Momentum swing on success / failure. The safe play's fail equals its
   *  win — nothing risked. */
  win: number;
  lose: number;
  /** Score a landed call pays AT EVEN ODDS. The real payout scales with
   *  the odds you actually took it at — see daringAt. */
  scoreBonus: number;
  consequence: CrossroadsConsequence;
}

export interface CrossroadsSituation {
  key: string;
  title: string;
  /** The board state that summons it: [minMomentum, maxMomentum]. */
  band: [number, number];
  narration: string;
  choices: CrossroadsChoice[];
}

/** The noise band a crossroads check rolls in. Exported because the odds
 *  the UI prints must come from the same number the engine rolls. */
export const CROSSROADS_SPREAD = 26;

export function crossroadsSpread(arena: ConditionEffects | undefined): number {
  return CROSSROADS_SPREAD * (arena?.noiseMult ?? 1);
}

/** The real chance a call lands, from the engine's own uniform noise —
 *  not a vibe, not a curve fit. */
export function winChanceOf(yourVal: number, theirVal: number, spread: number = CROSSROADS_SPREAD): number {
  const edge = yourVal - theirVal;
  return Math.max(0, Math.min(1, (edge + spread / 2) / spread));
}

/**
 * What a landed call actually pays. Daring is priced by RISK: at even
 * odds you get the catalog number, at 75% you get half of it, at 25% you
 * get one and a half times. This is the rule that stops "pick the thing
 * I'm best at" from being the whole game — being better at a call makes
 * it worth less, so the score on the board is earned by reading the
 * board, not by re-reading your own stat sheet.
 */
export function daringAt(scoreBonus: number, chance: number): number {
  return Math.round(scoreBonus * Math.max(0, 1 - chance) * 2);
}

export const CROSSROADS_CATALOG: CrossroadsSituation[] = [
  {
    key: "press_the_lead",
    title: "PRESS THE LEAD",
    band: [61, 100],
    narration: "20:00 — you're ahead. The map is yours to spend.",
    choices: [
      {
        key: "call_baron",
        label: "Call the Baron",
        description: "Start it ahead and dare them to walk in. Objectives + presence against their objectives and combat.",
        yourKeys: ["objectives", "presence"],
        theirKeys: ["objectives", "combat"],
        bonus: 5,
        win: 12,
        lose: -14,
        scoreBonus: 90,
        consequence: {
          note: "Land it and the pit is yours at 25:00. Miss and they take it while you're caught out — fights at −5.",
          onWin: { pit: "yours" },
          onFail: { pit: "theirs", fightFlat: -5 },
        },
      },
      {
        key: "siege_mid",
        label: "Siege mid",
        description: "Spend the lead on turrets. Turrets + damage against their survival and vision.",
        yourKeys: ["turrets", "damage"],
        theirKeys: ["survival", "vision"],
        bonus: 3,
        win: 8,
        lose: -6,
        scoreBonus: 45,
        consequence: {
          note: "Lands +800 gold, but you're across the map — objectives at −3 either way.",
          onWin: { gold: 800, objectivesFlat: -3 },
          onFail: { objectivesFlat: -3 },
        },
      },
      {
        key: "sit_on_it",
        label: "Sit on the lead",
        description: "Farm it out, concede nothing, set up at home. No roll — a small, certain gain.",
        yourKeys: [],
        theirKeys: [],
        bonus: 0,
        win: 3,
        lose: 3,
        scoreBonus: 0,
        consequence: {
          note: "No dice, no daring — and your base hold at +6 when they come.",
          onWin: { holdFlat: 6 },
        },
      },
    ],
  },
  {
    key: "the_baron_question",
    title: "THE BARON QUESTION",
    band: [40, 60],
    narration: "20:00 — dead even, and the Baron is up. Someone has to blink.",
    choices: [
      {
        key: "contest",
        label: "Contest the pit",
        description: "Walk in and play it 5v5. Objectives + combat against the same from them.",
        yourKeys: ["objectives", "combat"],
        theirKeys: ["objectives", "combat"],
        bonus: 0,
        win: 14,
        lose: -13,
        scoreBonus: 85,
        consequence: {
          note: "Win it and you hold the pit at 25:00. Lose it and they hold it, and you fight on at −6.",
          onWin: { pit: "yours" },
          onFail: { pit: "theirs", fightFlat: -6 },
        },
      },
      {
        key: "cross_map",
        label: "Trade cross-map",
        description: "Give the pit, take the bot side. Turrets + laning against their presence and vision.",
        yourKeys: ["turrets", "laning"],
        theirKeys: ["presence", "vision"],
        bonus: 4,
        win: 7,
        lose: -5,
        scoreBonus: 40,
        consequence: {
          note: "They get the pit either way. The trade pays +850 gold and a +5 hold if it lands.",
          onWin: { gold: 850, holdFlat: 5, pit: "theirs" },
          onFail: { pit: "theirs" },
        },
      },
      {
        key: "hunt_a_pick",
        label: "Hunt a pick",
        description: "Send your best fighter looking for a 5v4. Combat + damage against their vision and survival.",
        yourKeys: ["combat", "damage"],
        theirKeys: ["vision", "survival"],
        bonus: 0,
        win: 10,
        lose: -9,
        scoreBonus: 60,
        consequence: {
          note: "Land it and every fight after runs at +8. Miss and it's your carry on the floor: −4.",
          onWin: { fightFlat: 8 },
          onFail: { fightFlat: -4 },
        },
      },
    ],
  },
  {
    key: "from_the_pit",
    title: "FROM THE PIT",
    band: [0, 39],
    narration: "20:00 — you're behind, and the polite paths are gone.",
    choices: [
      {
        key: "desperation_flank",
        label: "The desperation flank",
        description: "Everything on one fight from an angle they don't watch. Combat + presence against their vision and combat.",
        yourKeys: ["combat", "presence"],
        theirKeys: ["vision", "combat"],
        bonus: 0,
        win: 18,
        lose: -11,
        scoreBonus: 115,
        consequence: {
          note: "Land it and you fight at +10 from here. Miss and there's nobody home: hold at −10.",
          onWin: { fightFlat: 10 },
          onFail: { holdFlat: -10 },
        },
      },
      {
        key: "split_push",
        label: "Refuse to group",
        description: "One in the side lane, four holding. Turrets + economy against their presence and objectives.",
        yourKeys: ["turrets", "economy"],
        theirKeys: ["presence", "objectives"],
        bonus: 2,
        win: 9,
        lose: -7,
        scoreBonus: 55,
        consequence: {
          note: "Lands +700 gold and a +4 hold. Fails and you're a man down in every fight: −5.",
          onWin: { gold: 700, holdFlat: 4 },
          onFail: { fightFlat: -5 },
        },
      },
      {
        key: "scale_out",
        label: "Weather it",
        description: "Give the map, keep the waves, wait for their mistake. Survival + economy against their turrets and objectives.",
        yourKeys: ["survival", "economy"],
        theirKeys: ["turrets", "objectives"],
        bonus: 6,
        win: 7,
        lose: -4,
        scoreBonus: 35,
        consequence: {
          note: "They take the pit unopposed while your base digs in — hold at +10. The long game.",
          onWin: { holdFlat: 10, pit: "theirs" },
          onFail: { holdFlat: 6, pit: "theirs" },
        },
      },
    ],
  },
];

export const CROSSROADS_BY_KEY = new Map(CROSSROADS_CATALOG.map((situation) => [situation.key, situation]));

/** Which situation a scoreboard summons. Bands cover 0-100 completely. */
export function situationFor(momentum: number): CrossroadsSituation {
  return (
    CROSSROADS_CATALOG.find(
      (situation) => momentum >= situation.band[0] && momentum <= situation.band[1],
    ) ?? CROSSROADS_CATALOG[1]
  );
}

/** The safe (no-roll or lowest-stakes) choice — the calibration floor and
 *  what an abandoned crossroads resolves as. */
export function safeChoiceOf(situation: CrossroadsSituation): CrossroadsChoice {
  return [...situation.choices].sort((a, b) => b.lose - a.lose)[0];
}
