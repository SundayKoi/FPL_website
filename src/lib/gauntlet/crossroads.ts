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
  {
    key: "the_map_is_open",
    title: "THE MAP IS OPEN",
    band: [61, 100],
    narration: "20:00 — they have stopped contesting. Nobody is stopping you doing something stupid, either.",
    choices: [
      {
        key: "invade_their_jungle",
        label: "Live in their jungle",
        description: "Take the game to their side of the map. Vision + presence against their vision and survival.",
        yourKeys: ["vision", "presence"],
        theirKeys: ["vision", "survival"],
        bonus: 4,
        win: 11,
        lose: -13,
        scoreBonus: 80,
        consequence: {
          note: "Land it and you see everything: objectives +6. Get caught and you are deep with no vision — fights at −6.",
          onWin: { objectivesFlat: 6 },
          onFail: { fightFlat: -6 },
        },
      },
      {
        key: "trade_the_map",
        label: "Trade side to side",
        description: "Give them a turret, take two. Turrets + economy against their turrets and impact.",
        yourKeys: ["turrets", "economy"],
        theirKeys: ["turrets", "impact"],
        bonus: 3,
        win: 7,
        lose: -5,
        scoreBonus: 40,
        consequence: {
          note: "A won trade banks 900 gold. A lost one means they got the better end of it — your base hold drops 4.",
          onWin: { gold: 900 },
          onFail: { holdFlat: -4 },
        },
      },
      {
        key: "stack_vision",
        label: "Stack the pit vision",
        description: "Spend the lead on ward cover around Baron. No roll — you know where they are at 25:00.",
        yourKeys: [],
        theirKeys: [],
        bonus: 0,
        win: 2,
        lose: 2,
        scoreBonus: 0,
        consequence: {
          note: "No dice. The pit is yours at 25:00, and that is the whole play.",
          onWin: { pit: "yours" },
        },
      },
    ],
  },
  {
    key: "close_it_out",
    title: "CLOSE IT OUT",
    band: [61, 100],
    narration: "20:00 — the lead is real. Games like this are lost by taking one more fight than you needed.",
    choices: [
      {
        key: "force_the_last_fight",
        label: "Force it now",
        description: "End it while the gold is yours. Combat + damage against their combat and survival.",
        yourKeys: ["combat", "damage"],
        theirKeys: ["combat", "survival"],
        bonus: 5,
        win: 13,
        lose: -15,
        scoreBonus: 95,
        consequence: {
          note: "Win and their base is open — the hold at +8. Lose and you handed back the game: fights −7 and the pit is theirs.",
          onWin: { holdFlat: 8 },
          onFail: { fightFlat: -7, pit: "theirs" },
        },
      },
      {
        key: "starve_them",
        label: "Take their camps",
        description: "Deny the comeback rather than end it. Economy + vision against their economy and presence.",
        yourKeys: ["economy", "vision"],
        theirKeys: ["economy", "presence"],
        bonus: 4,
        win: 6,
        lose: -4,
        scoreBonus: 35,
        consequence: {
          note: "Lands 700 gold and leaves them nothing to fight with — the hold at +4. Miss and you spent the window across the map: objectives −4.",
          onWin: { gold: 700, holdFlat: 4 },
          onFail: { objectivesFlat: -4 },
        },
      },
      {
        key: "play_the_clock",
        label: "Play the clock",
        description: "Concede the map, hold the lead, take nothing on. No roll, no risk, no reward.",
        yourKeys: [],
        theirKeys: [],
        bonus: 0,
        win: 3,
        lose: 3,
        scoreBonus: 0,
        consequence: {
          note: "No dice and no daring — but the base hold at +7 when it finally comes.",
          onWin: { holdFlat: 7 },
        },
      },
    ],
  },
  {
    key: "the_even_game",
    title: "THE EVEN GAME",
    band: [40, 60],
    narration: "20:00 — nothing separates you. Whoever blinks first hands over the next ten minutes.",
    choices: [
      {
        key: "take_the_first_swing",
        label: "Take the first swing",
        description: "Start the fight rather than answer one. Combat + presence against their survival and combat.",
        yourKeys: ["combat", "presence"],
        theirKeys: ["survival", "combat"],
        bonus: 2,
        win: 14,
        lose: -14,
        scoreBonus: 100,
        consequence: {
          note: "The pit follows the swing: land it and 25:00 is yours, miss it and it is theirs.",
          onWin: { pit: "yours", fightFlat: 4 },
          onFail: { pit: "theirs", fightFlat: -4 },
        },
      },
      {
        key: "split_the_map",
        label: "Split them apart",
        description: "One side lane, four elsewhere, make them choose. Turrets + laning against their presence and vision.",
        yourKeys: ["turrets", "laning"],
        theirKeys: ["presence", "vision"],
        bonus: 3,
        win: 9,
        lose: -8,
        scoreBonus: 60,
        consequence: {
          note: "A working split is 750 gold and a turret. A read one leaves you a man short at the pit — objectives −5.",
          onWin: { gold: 750 },
          onFail: { objectivesFlat: -5 },
        },
      },
      {
        key: "hold_the_middle",
        label: "Hold the middle",
        description: "Give up nothing, chase nothing, wait for their mistake. No roll.",
        yourKeys: [],
        theirKeys: [],
        bonus: 0,
        win: 2,
        lose: 2,
        scoreBonus: 0,
        consequence: {
          note: "No dice. A small, certain step, and your side of the soul dragon at +4.",
          onWin: { objectivesFlat: 4 },
        },
      },
    ],
  },
  {
    key: "the_soul_race",
    title: "THE SOUL RACE",
    band: [40, 60],
    narration: "20:00 — the dragons are level and the next one decides the map. Neither of you can walk away from it.",
    choices: [
      {
        key: "commit_to_soul",
        label: "Commit to soul",
        description: "Stack the whole team on the drake and dare them to come. Objectives + combat against their objectives and damage.",
        yourKeys: ["objectives", "combat"],
        theirKeys: ["objectives", "damage"],
        bonus: 4,
        win: 12,
        lose: -13,
        scoreBonus: 85,
        consequence: {
          note: "Winning it is worth +7 on every objective after. Losing it while stacked hands them the pit as well.",
          onWin: { objectivesFlat: 7 },
          onFail: { pit: "theirs" },
        },
      },
      {
        key: "trade_for_baron_setup",
        label: "Trade it for the pit",
        description: "Concede the drake, take the vision and the timer instead. Vision + economy against their presence and impact.",
        yourKeys: ["vision", "economy"],
        theirKeys: ["presence", "impact"],
        bonus: 3,
        win: 6,
        lose: -6,
        scoreBonus: 45,
        consequence: {
          note: "Trading well hands you the pit at 25:00. Trading badly gives up both — objectives −4.",
          onWin: { pit: "yours" },
          onFail: { objectivesFlat: -4 },
        },
      },
      {
        key: "contest_and_leave",
        label: "Show, then leave",
        description: "Threaten it, take the turret they leave open, never actually fight. No roll.",
        yourKeys: [],
        theirKeys: [],
        bonus: 0,
        win: 2,
        lose: 2,
        scoreBonus: 0,
        consequence: {
          note: "No dice, 500 gold, and nobody dies for it.",
          onWin: { gold: 500 },
        },
      },
    ],
  },
  {
    key: "backs_to_the_wall",
    title: "BACKS TO THE WALL",
    band: [0, 39],
    narration: "20:00 — they are through the mid turret and you are playing for the next mistake, not the next objective.",
    choices: [
      {
        key: "all_in_the_pit",
        label: "Sit in the pit and wait",
        description: "Hide on their Baron and swing when they start it. Presence + vision against their vision and objectives.",
        yourKeys: ["presence", "vision"],
        theirKeys: ["vision", "objectives"],
        bonus: 1,
        win: 20,
        lose: -12,
        scoreBonus: 150,
        consequence: {
          note: "A steal turns the game over — the pit is yours and fights swing +8. Caught first and it is over faster: −8.",
          onWin: { pit: "yours", fightFlat: 8 },
          onFail: { fightFlat: -8 },
        },
      },
      {
        key: "sell_a_lane",
        label: "Sell a side lane",
        description: "Give them a turret to buy four camps and a reset. Economy + laning against their turrets and impact.",
        yourKeys: ["economy", "laning"],
        theirKeys: ["turrets", "impact"],
        bonus: 2,
        win: 8,
        lose: -6,
        scoreBonus: 55,
        consequence: {
          note: "A clean sale is 800 gold back. A bad one is a turret for nothing — the hold drops 4.",
          onWin: { gold: 800 },
          onFail: { holdFlat: -4 },
        },
      },
      {
        key: "turtle_up",
        label: "Turtle",
        description: "Everyone home, nothing conceded past the base, wait for a bad engage. No roll.",
        yourKeys: [],
        theirKeys: [],
        bonus: 0,
        win: 4,
        lose: 4,
        scoreBonus: 0,
        consequence: {
          note: "No dice — and the base hold at +9, which is the only fight you intend to take.",
          onWin: { holdFlat: 9 },
        },
      },
    ],
  },
  {
    key: "one_thread_left",
    title: "ONE THREAD LEFT",
    band: [0, 39],
    narration: "20:00 — it is not lost yet, but everything you do now has to be worth more than it costs.",
    choices: [
      {
        key: "hunt_their_carry",
        label: "Hunt the carry",
        description: "Five people, one target, every time they step up. Damage + presence against their survival and vision.",
        yourKeys: ["damage", "presence"],
        theirKeys: ["survival", "vision"],
        bonus: 1,
        win: 17,
        lose: -11,
        scoreBonus: 130,
        consequence: {
          note: "Take them out of the game and the fights come back to you: +7. Miss and you spent the whole map on it — objectives −6.",
          onWin: { fightFlat: 7 },
          onFail: { objectivesFlat: -6 },
        },
      },
      {
        key: "steal_the_tempo",
        label: "Cross-map while they push",
        description: "Trade their siege for your objective. Objectives + turrets against their impact and combat.",
        yourKeys: ["objectives", "turrets"],
        theirKeys: ["impact", "combat"],
        bonus: 2,
        win: 10,
        lose: -9,
        scoreBonus: 75,
        consequence: {
          note: "A landed trade is 850 gold and the pit. A missed one is a base you were not defending — hold −5.",
          onWin: { gold: 850, pit: "yours" },
          onFail: { holdFlat: -5 },
        },
      },
      {
        key: "buy_time",
        label: "Buy time",
        description: "Farm what is safe, give up what is not, make them prove it. No roll.",
        yourKeys: [],
        theirKeys: [],
        bonus: 0,
        win: 3,
        lose: 3,
        scoreBonus: 0,
        consequence: {
          note: "No dice, 400 gold, and your side of the base hold up 5.",
          onWin: { gold: 400, holdFlat: 5 },
        },
      },
    ],
  },
];

export const CROSSROADS_BY_KEY = new Map(CROSSROADS_CATALOG.map((situation) => [situation.key, situation]));

/**
 * Which situation a scoreboard summons. Bands cover 0-100 completely, and
 * several situations share each band.
 *
 * `seed` picks between them. It is NOT drawn from the match's rand: that
 * stream is load-bearing (a stored seed replays a run exactly, and the
 * calibration suites read it), so consuming a value here would shift every
 * roll after it. It comes from the week and the round instead, which means
 * the whole league gets the same call on the same round — the same promise
 * the seeded opponent cast already makes. The cast is public; the dice are
 * not.
 *
 * Without a seed it answers the first situation in the band, which is what
 * it always did.
 */
export function situationFor(momentum: number, seed?: number): CrossroadsSituation {
  const candidates = CROSSROADS_CATALOG.filter(
    (situation) => momentum >= situation.band[0] && momentum <= situation.band[1],
  );
  if (candidates.length > 0) {
    const index = seed === undefined ? 0 : Math.abs(Math.trunc(seed)) % candidates.length;
    return candidates[index];
  }
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
