// Contracts: three things to go and do this week.
//
// A contract is a small, printed objective — "win a round with a protect
// comp", "take the Baron", "beat a wall" — checked against every round
// you win and paid once, in dollars, the first time you do it that week.
// Three rotate in each Monday off the week seed, the same three for the
// whole league, so "have you done the steal one yet" is a question with
// one answer.
//
// They exist to make the no-repeat rule mean something: the reason to
// draft a different five is that this week's contracts want one. And the
// count of contracts finished across the season is what unlocks openers
// (src/lib/gauntlet/openers.ts) — the only permanent power in the mode,
// earned by playing differently rather than by playing more.

import { weekSeed } from "./opponents";
import type { OpponentTeam } from "./opponents";
import type { GauntletRunRow } from "./run";
import type { HalfState, MatchResult } from "./sim";

/** Everything a contract may read about a round that was just won. */
export interface ContractRound {
  run: Pick<GauntletRunRow, "round" | "lineup" | "relics" | "ascension">;
  /** The first half as it stood at the crossroads. */
  state: Pick<HalfState, "momentum" | "lanesWon">;
  result: Pick<MatchResult, "won" | "yourStyle" | "daring" | "baron" | "momentum">;
  opponent: Pick<OpponentTeam, "boss" | "ghost"> | null;
}

export interface ContractDef {
  key: string;
  title: string;
  /** What to do, in one line. */
  blurb: string;
  /** Betting dollars, paid once per week. */
  reward: number;
  /** True when the round just won satisfies it. */
  check: (round: ContractRound) => boolean;
}

/** How many a week offers. */
export const CONTRACTS_PER_WEEK = 3;

export const CONTRACT_CATALOG: ContractDef[] = [
  {
    key: "past_the_gate",
    title: "PAST THE GATE",
    blurb: "Win round 4.",
    reward: 25,
    check: ({ run }) => run.round >= 4,
  },
  {
    key: "protect_and_serve",
    title: "PROTECT AND SERVE",
    blurb: "Win a round with a protect comp.",
    reward: 20,
    check: ({ result }) => result.yourStyle === "protect",
  },
  {
    key: "poke_them_out",
    title: "POKE THEM OUT",
    blurb: "Win a round with a poke comp.",
    reward: 20,
    check: ({ result }) => result.yourStyle === "poke",
  },
  {
    key: "dive_in",
    title: "DIVE IN",
    blurb: "Win a round with a dive comp.",
    reward: 20,
    check: ({ result }) => result.yourStyle === "dive",
  },
  {
    key: "from_the_pit",
    title: "FROM THE PIT",
    blurb: "Win a round you were behind in at the crossroads (momentum under 40).",
    reward: 30,
    check: ({ state }) => state.momentum < 40,
  },
  {
    key: "the_daring",
    title: "THE DARING",
    blurb: "Land a crossroads call worth 60 daring or more.",
    reward: 30,
    check: ({ result }) => result.daring >= 60,
  },
  {
    key: "baron_blood",
    title: "BARON BLOOD",
    blurb: "Start the Baron and take it.",
    reward: 25,
    check: ({ result }) => result.baron.attempted && result.baron.yours && result.baron.taken,
  },
  {
    key: "the_steal",
    title: "THE STEAL",
    blurb: "Steal a Baron they started.",
    reward: 40,
    check: ({ result }) => result.baron.stolen,
  },
  {
    key: "clean_sweep",
    title: "CLEAN SWEEP",
    blurb: "Win all five lanes in one game.",
    reward: 30,
    check: ({ state }) => state.lanesWon >= 5,
  },
  {
    key: "wall_breaker",
    title: "WALL BREAKER",
    blurb: "Beat a wall.",
    reward: 30,
    check: ({ opponent }) => Boolean(opponent?.boss),
  },
  {
    key: "ghost_hunter",
    title: "GHOST HUNTER",
    blurb: "Beat a ★ bounty.",
    reward: 35,
    check: ({ opponent }) => opponent?.ghost?.bounty === true,
  },
  {
    key: "the_climber",
    title: "THE CLIMBER",
    blurb: "Win a round at ascension 1 or higher.",
    reward: 25,
    check: ({ run }) => (run.ascension ?? 0) >= 1,
  },
  {
    key: "fresh_legs",
    title: "FRESH LEGS",
    blurb: "Win a round fielding two or more of this week's prints.",
    reward: 20,
    check: ({ run }) => run.lineup.filter((card) => card.fresh).length >= 2,
  },
  {
    key: "the_long_road",
    title: "THE LONG ROAD",
    blurb: "Win round 6.",
    reward: 40,
    check: ({ run }) => run.round >= 6,
  },
];

export const CONTRACT_BY_KEY = new Map(CONTRACT_CATALOG.map((contract) => [contract.key, contract]));

/** This week's three, the same for everyone: drawn without replacement
 *  off the week seed (a round number no real round uses). */
export function contractsForWeek(weekStart: string): ContractDef[] {
  const pool = [...CONTRACT_CATALOG];
  const picked: ContractDef[] = [];
  let seed = weekSeed(weekStart, 99);
  while (picked.length < CONTRACTS_PER_WEEK && pool.length > 0) {
    // A tiny LCG over the seed: enough to pick three, and stable.
    seed = (Math.imul(seed, 1664525) + 1013904223) >>> 0;
    const index = seed % pool.length;
    picked.push(pool.splice(index, 1)[0]);
  }
  return picked;
}

/** The contracts a won round satisfies, among those still open. */
export function contractsSatisfied(
  weekStart: string,
  done: Iterable<string>,
  round: ContractRound,
): ContractDef[] {
  if (!round.result.won) return [];
  const finished = new Set(done);
  return contractsForWeek(weekStart).filter((contract) => !finished.has(contract.key) && contract.check(round));
}
