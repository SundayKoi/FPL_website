// A week's pairings.
//
// The round robin is capped: each team plays at most MAX_ROUND_ROBIN_GAMES
// a week, so a six-team week is three rounds, not five. Rounds come from the
// circle method (every team meets a new opponent each round); a team left
// short by an odd count is paired again with another short team it has not
// met, when there is one.

import { ELIMINATION_START_WEEK, MAX_ROUND_ROBIN_GAMES, type MatchStage, type Tier } from "./types";

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

/**
 * Random sides for each match: team A takes blue side, team B red. Every
 * match the event creates goes through this, so nobody is always blue.
 */
export function assignSides<T extends { teamA: string; teamB: string }>(pairs: T[], random: () => number = Math.random): T[] {
  return pairs.map((pair) => (random() < 0.5 ? { ...pair, teamA: pair.teamB, teamB: pair.teamA } : pair));
}

export interface TierSchedule {
  stage: MatchStage;
  bestOf: 1 | 3 | 5;
  pairings: Pairing[];
}

/**
 * The matches a tier gets as soon as its teams are imported. The main tier
 * plays a Bo1 round robin and the elimination tier Bo5 pairings. From week
 * 3, a week that comes down to two main teams and no elimination tier is
 * the final, a Bo5.
 */
export function tierSchedule({
  tier,
  teamIds,
  weekNumber,
  hasEliminationTier,
}: {
  tier: Tier;
  teamIds: string[];
  weekNumber: number;
  hasEliminationTier: boolean;
}): TierSchedule | null {
  if (teamIds.length < 2) return null;
  if (tier === "elimination") return { stage: "elimination", bestOf: 5, pairings: eliminationPairings(teamIds) };
  if (teamIds.length === 2 && !hasEliminationTier && weekNumber >= ELIMINATION_START_WEEK) {
    return { stage: "final", bestOf: 5, pairings: [{ teamA: teamIds[0], teamB: teamIds[1], round: 1 }] };
  }
  return { stage: "round_robin", bestOf: 1, pairings: roundRobinPairings(teamIds) };
}
