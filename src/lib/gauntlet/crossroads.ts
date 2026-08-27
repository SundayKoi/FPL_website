// The crossroads — the mid-game decision that makes a fight a GAME.
//
// At minute ~20 the sim pauses on a situation picked by the scoreboard
// (ahead, even, or desperate) and hands the player two or three calls.
// Every call is an open-book check: WHICH of your stats it rolls, which
// of theirs it rolls against, and what's staked either way are all in the
// catalog — the UI prints the real numbers, because "contest Baron at
// objectives 64 vs their 71" is a decision and "pick a button" is not.
//
// Same purity rules as the sim: resolution is a function of (state,
// choice, seed). The safe option in every situation is the calibration
// baseline — the floor a player who never gambles gets.

import type { MeasureKey } from "@/lib/cards/measures";

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
  /** Extra run score for CALLING it and landing it — daring pays the
   *  board, not just the map. */
  scoreBonus: number;
}

export interface CrossroadsSituation {
  key: string;
  title: string;
  /** The board state that summons it: [minMomentum, maxMomentum]. */
  band: [number, number];
  narration: string;
  choices: CrossroadsChoice[];
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
        description: "Start it ahead and dare them to fight. Objectives + presence against their objectives.",
        yourKeys: ["objectives", "presence"],
        theirKeys: ["objectives", "combat"],
        bonus: 5,
        win: 14,
        lose: -16,
        scoreBonus: 90,
      },
      {
        key: "siege_mid",
        label: "Siege mid",
        description: "Trade the lead for turrets. Turrets + damage against their survival.",
        yourKeys: ["turrets", "damage"],
        theirKeys: ["survival", "vision"],
        bonus: 3,
        win: 8,
        lose: -6,
        scoreBonus: 40,
      },
      {
        key: "sit_on_it",
        label: "Sit on the lead",
        description: "Farm it out, concede nothing. No roll — a small, certain gain.",
        yourKeys: [],
        theirKeys: [],
        bonus: 0,
        win: 3,
        lose: 3,
        scoreBonus: 0,
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
        description: "Walk in and play it 5v5. Objectives + combat against the same from them — the whole game can turn here.",
        yourKeys: ["objectives", "combat"],
        theirKeys: ["objectives", "combat"],
        bonus: 0,
        win: 16,
        lose: -14,
        scoreBonus: 80,
      },
      {
        key: "cross_map",
        label: "Trade cross-map",
        description: "Give the Baron, take the bot lane. Turrets + laning against their presence — safer, smaller.",
        yourKeys: ["turrets", "laning"],
        theirKeys: ["presence", "vision"],
        bonus: 4,
        win: 7,
        lose: -5,
        scoreBonus: 35,
      },
      {
        key: "hunt_a_pick",
        label: "Hunt a pick",
        description: "Send your best fighter to make it 5v4 first. Combat + damage against their vision.",
        yourKeys: ["combat", "damage"],
        theirKeys: ["vision", "survival"],
        bonus: 0,
        win: 11,
        lose: -9,
        scoreBonus: 55,
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
        description: "Everything on one fight from an angle they don't see. Combat + presence against their vision — win huge or die there.",
        yourKeys: ["combat", "presence"],
        theirKeys: ["vision", "combat"],
        bonus: 0,
        win: 20,
        lose: -12,
        scoreBonus: 110,
      },
      {
        key: "scale_out",
        label: "Weather it",
        description: "Give the map, keep the waves, wait for their mistake. Survival + economy against their turrets.",
        yourKeys: ["survival", "economy"],
        theirKeys: ["turrets", "objectives"],
        bonus: 6,
        win: 8,
        lose: -4,
        scoreBonus: 30,
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
 *  what an abandoned crossroads resolves as. Last in each list by
 *  convention isn't guaranteed, so find the smallest downside. */
export function safeChoiceOf(situation: CrossroadsSituation): CrossroadsChoice {
  return [...situation.choices].sort((a, b) => b.lose - a.lose)[0];
}
