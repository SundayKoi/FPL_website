// A week's pairings.
//
// The round robin is capped: each team plays at most MAX_ROUND_ROBIN_GAMES
// a week, so a six-team week is three rounds, not five. Rounds come from the
// circle method (every team meets a new opponent each round); a team left
// short by an odd count is paired again with another short team it has not
// met, when there is one.

import { MAX_ROUND_ROBIN_GAMES } from "./types";

export interface Pairing {
  teamA: string;
  teamB: string;
  round: number;
}

function circleRounds(teams: string[]): [string, string][][] {
  const slots: (string | null)[] = teams.length % 2 === 0 ? [...teams] : [...teams, null];
  const rounds: [string, string][][] = [];
  for (let round = 0; round < slots.length - 1; round += 1) {
    const pairs: [string, string][] = [];
    for (let i = 0; i < slots.length / 2; i += 1) {
      const a = slots[i];
      const b = slots[slots.length - 1 - i];
      if (a && b) pairs.push([a, b]);
    }
    rounds.push(pairs);
    // Hold the first slot, rotate the rest one step.
    slots.splice(1, 0, slots.pop()!);
  }
  return rounds;
}

const pairKey = (a: string, b: string) => (a < b ? `${a}|${b}` : `${b}|${a}`);

/** Round-robin pairings with at most `maxGames` per team. */
export function roundRobinPairings(teams: string[], maxGames = MAX_ROUND_ROBIN_GAMES): Pairing[] {
  if (teams.length < 2) return [];
  const cap = Math.min(maxGames, teams.length - 1);
  const played = new Map(teams.map((team) => [team, 0]));
  const met = new Set<string>();
  const pairings: Pairing[] = [];

  circleRounds(teams).forEach((pairs, index) => {
    for (const [a, b] of pairs) {
      if (played.get(a)! >= cap || played.get(b)! >= cap) continue;
      pairings.push({ teamA: a, teamB: b, round: index + 1 });
      played.set(a, played.get(a)! + 1);
      played.set(b, played.get(b)! + 1);
      met.add(pairKey(a, b));
    }
  });

  // Top up teams an odd count left a game short.
  const lastRound = pairings.reduce((max, pairing) => Math.max(max, pairing.round), 0);
  for (const a of teams) {
    for (const b of teams) {
      if (a >= b || met.has(pairKey(a, b))) continue;
      if (played.get(a)! >= cap || played.get(b)! >= cap) continue;
      pairings.push({ teamA: a, teamB: b, round: lastRound + 1 });
      played.set(a, played.get(a)! + 1);
      played.set(b, played.get(b)! + 1);
      met.add(pairKey(a, b));
    }
  }
  return pairings;
}

/**
 * Elimination-tier pairings: teams in pairs (first against second, third
 * against fourth); an odd count plays a full round robin so every team has
 * a result to be judged on.
 */
export function eliminationPairings(teams: string[]): Pairing[] {
  if (teams.length < 2) return [];
  if (teams.length % 2 === 1) return roundRobinPairings(teams, teams.length - 1);
  const pairings: Pairing[] = [];
  for (let i = 0; i + 1 < teams.length; i += 2) {
    pairings.push({ teamA: teams[i], teamB: teams[i + 1], round: 1 });
  }
  return pairings;
}
