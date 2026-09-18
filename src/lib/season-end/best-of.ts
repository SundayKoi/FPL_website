import { championByName } from "@/lib/match-draft/champions";

/** Best-of evidence thresholds. Keep these in one place for the selector and UI. */
export const BEST_OF_MIN_PLAYER_GAMES = 5;
export const BEST_OF_MIN_CHAMPION_GAMES = 3;
export const BEST_OF_EXPANSION_MIN_GAMES = 2;
export const BEST_OF_EXPANSION_MIN_WINS = 1;
export type BestOfPass = "original" | "expansion" | "remaining";
export type BestOfAwardedCandidate = BestOfCandidate & { selectionPass: BestOfPass };

export interface BestOfAppearance {
  playerKey: string;
  playerName: string;
  team: string;
  champion: string;
  win: boolean;
  performance: number;
}

export interface BestOfCandidate {
  playerKey: string;
  playerName: string;
  team: string;
  championId: string;
  champion: string;
  seasonGames: number;
  championGames: number;
  wins: number;
  meanPerformance: number;
}

export interface BestOfChampionExclusion {
  championId: string;
  champion: string;
  games: number;
  players: Array<{ playerKey: string; playerName: string; games: number; seasonGames: number }>;
}

export type BestOfSkipReason = "player-cap" | "champion-cap";

export interface BestOfSkippedCandidate {
  candidate: BestOfCandidate;
  reason: BestOfSkipReason;
  blockedBy?: BestOfCandidate;
}

export interface BestOfCapPromotion {
  candidateKey: string;
  championId: string;
  champion: string;
  recipientPlayerKey: string;
  recipientName: string;
  unrestrictedLeaderPlayerKey: string;
  unrestrictedLeaderName: string;
}

export type BestOfPlayerWithoutCardReason = "player-threshold" | "champion-threshold" | "one-card-cap";

export interface BestOfPlayerWithoutCard {
  playerKey: string;
  playerName: string;
  seasonGames: number;
  reason: BestOfPlayerWithoutCardReason;
}

export interface BestOfUnawardedChampion {
  championId: string;
  champion: string;
  reason: "champion-threshold" | "one-card-cap";
}

export interface BestOfSelectionDiagnostics {
  playerThreshold: number;
  championThreshold: number;
  totalPlayers: number;
  eligiblePlayers: number;
  qualifyingCandidates: number;
  awardedPlayers: number;
  awardedChampions: number;
  passCounts: Record<BestOfPass, number>;
  playersBelowThreshold: Array<{ playerKey: string; playerName: string; seasonGames: number }>;
  playersWithoutCard: BestOfPlayerWithoutCard[];
  championsBelowThreshold: BestOfChampionExclusion[];
  contestedChampions: Array<{ championId: string; champion: string; candidates: BestOfCandidate[] }>;
  skippedCandidates: BestOfSkippedCandidate[];
  capPromotions: BestOfCapPromotion[];
  unawardedChampions: BestOfUnawardedChampion[];
}

export interface BestOfSelection {
  /** Every played champion for eligible players, in result ranking order. */
  candidates: BestOfCandidate[];
  /** Earlier passes are locked; results are ranked within each pass. */
  selected: BestOfAwardedCandidate[];
  /** The same awards in stable champion presentation order. */
  presentation: BestOfAwardedCandidate[];
  diagnostics: BestOfSelectionDiagnostics;
}

export interface CanonicalChampion {
  id: string;
  displayName: string;
}

/** Resolve Data Dragon ids and display names before any champion grouping. */
export function canonicalChampion(name: string): CanonicalChampion {
  const raw = name.trim();
  const known = championByName(raw);
  if (known) return { id: known.id, displayName: known.name };

  const id = raw.toLowerCase().replace(/[^a-z0-9]/g, "");
  return { id: id || raw, displayName: raw };
}

/** Explicit ordinal comparison keeps the final tie-break independent of locale. */
export function compareOrdinal(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference) return difference;
  }
  return left.length - right.length;
}

function candidateKey(candidate: BestOfCandidate): string {
  return `${candidate.playerKey}:${candidate.championId}`;
}

/** Compare the three result criteria, then the canonical stable tie-breakers. */
export function compareBestOfCandidates(left: BestOfCandidate, right: BestOfCandidate): number {
  if (left.wins !== right.wins) return right.wins - left.wins;

  // Compare wins / games without rounding the win rate.
  const rightRate = BigInt(right.wins) * BigInt(left.championGames);
  const leftRate = BigInt(left.wins) * BigInt(right.championGames);
  if (rightRate !== leftRate) return rightRate > leftRate ? 1 : -1;

  if (left.meanPerformance !== right.meanPerformance) {
    return right.meanPerformance - left.meanPerformance;
  }
  return compareOrdinal(left.championId, right.championId) || compareOrdinal(left.playerKey, right.playerKey);
}

function groupBy<T>(rows: readonly T[], key: (row: T) => string): Map<string, T[]> {
  const grouped = new Map<string, T[]>();
  for (const row of rows) grouped.set(key(row), [...(grouped.get(key(row)) ?? []), row]);
  return grouped;
}

function sortPlayers<T extends { playerKey: string }>(rows: T[]): T[] {
  return rows.slice().sort((left, right) => compareOrdinal(left.playerKey, right.playerKey));
}

/**
 * Select Best-of cards from already validated regular-season appearances.
 * This function has no rendering, database, or league-specific dependencies.
 */
export function selectBestOf(appearances: readonly BestOfAppearance[]): BestOfSelection {
  const players = groupBy(appearances, (appearance) => appearance.playerKey);
  const champions = groupBy(appearances, (appearance) => canonicalChampion(appearance.champion).id);
  const playerSummaries = sortPlayers([...players.entries()].map(([playerKey, rows]) => ({
    playerKey,
    playerName: rows[0].playerName,
    seasonGames: rows.length,
  })));
  const eligiblePlayerKeys = new Set(
    playerSummaries.filter((player) => player.seasonGames >= BEST_OF_MIN_PLAYER_GAMES).map((player) => player.playerKey),
  );
  const playersBelowThreshold = playerSummaries
    .filter((player) => player.seasonGames < BEST_OF_MIN_PLAYER_GAMES)
    .map(({ playerKey, playerName, seasonGames }) => ({ playerKey, playerName, seasonGames }));

  const championExclusions: BestOfChampionExclusion[] = [];
  const candidates: BestOfCandidate[] = [];
  for (const [championId, championAppearances] of champions) {
    const champion = canonicalChampion(championAppearances[0].champion);
    const byPlayer = groupBy(championAppearances, (appearance) => appearance.playerKey);
    const qualifying = [] as BestOfCandidate[];
    for (const [playerKey, playerAppearances] of byPlayer) {
      if (!eligiblePlayerKeys.has(playerKey)) continue;
      const playerAppearancesInSeason = players.get(playerKey)!;
      qualifying.push({
        playerKey,
        playerName: playerAppearances[0].playerName,
        team: [...new Set(playerAppearancesInSeason.map((appearance) => appearance.team))].join(" / "),
        championId,
        champion: champion.displayName,
        seasonGames: playerAppearancesInSeason.length,
        championGames: playerAppearances.length,
        wins: playerAppearances.filter((appearance) => appearance.win).length,
        meanPerformance: playerAppearances.reduce((total, appearance) => total + appearance.performance, 0) / playerAppearances.length,
      });
    }

    if (!qualifying.length) {
      championExclusions.push({
        championId,
        champion: champion.displayName,
        games: championAppearances.length,
        players: sortPlayers([...byPlayer.entries()].map(([playerKey, rows]) => ({
          playerKey,
          playerName: rows[0].playerName,
          games: rows.length,
          seasonGames: players.get(playerKey)!.length,
        }))),
      });
    }
    candidates.push(...qualifying);
  }

  const orderedCandidates = candidates.slice().sort(compareBestOfCandidates);
  const contestedChampions = [...groupBy(orderedCandidates, (candidate) => candidate.championId).entries()]
    .filter(([, championCandidates]) => championCandidates.length > 1)
    .map(([championId, championCandidates]) => ({
      championId,
      champion: championCandidates[0].champion,
      candidates: championCandidates.slice(),
    }))
    .sort((left, right) => compareOrdinal(left.championId, right.championId));

  const usedPlayers = new Set<string>();
  const usedChampions = new Set<string>();
  const winnerByPlayer = new Map<string, BestOfCandidate>();
  const winnerByChampion = new Map<string, BestOfCandidate>();
  const selected: BestOfAwardedCandidate[] = [];
  const skippedCandidates: BestOfSkippedCandidate[] = [];
  // Disjoint pools ensure each record is evaluated once. Every later pass
  // shares the same caps, so it cannot replace an earlier player/champion pair.
  const passFor = (candidate: BestOfCandidate): BestOfPass =>
    candidate.championGames >= BEST_OF_MIN_CHAMPION_GAMES ? "original"
      : candidate.championGames >= BEST_OF_EXPANSION_MIN_GAMES && candidate.wins >= BEST_OF_EXPANSION_MIN_WINS
        ? "expansion" : "remaining";
  const allocationOrder = (["original", "expansion", "remaining"] as const)
    .flatMap((pass) => orderedCandidates.filter((candidate) => passFor(candidate) === pass));
  for (const candidate of allocationOrder) {
    const blockingPlayer = winnerByPlayer.get(candidate.playerKey);
    const blockingChampion = winnerByChampion.get(candidate.championId);
    if (blockingPlayer) {
      skippedCandidates.push({ candidate, reason: "player-cap", blockedBy: blockingPlayer });
    } else if (blockingChampion) {
      skippedCandidates.push({ candidate, reason: "champion-cap", blockedBy: blockingChampion });
    } else {
      selected.push({ ...candidate, selectionPass: passFor(candidate) });
      usedPlayers.add(candidate.playerKey);
      usedChampions.add(candidate.championId);
      winnerByPlayer.set(candidate.playerKey, candidate);
      winnerByChampion.set(candidate.championId, candidate);
    }
  }

  const capPromotions: BestOfCapPromotion[] = [];
  for (const winner of selected) {
    // Compare within allocation priority: a two-game record cannot displace
    // an original winner even if it has a higher win rate.
    const championCandidates = allocationOrder.filter((candidate) => candidate.championId === winner.championId);
    const unrestrictedLeader = championCandidates[0];
    if (unrestrictedLeader && unrestrictedLeader.playerKey !== winner.playerKey) {
      capPromotions.push({
        candidateKey: candidateKey(winner),
        championId: winner.championId,
        champion: winner.champion,
        recipientPlayerKey: winner.playerKey,
        recipientName: winner.playerName,
        unrestrictedLeaderPlayerKey: unrestrictedLeader.playerKey,
        unrestrictedLeaderName: unrestrictedLeader.playerName,
      });
    }
  }

  const playersWithoutCard: BestOfPlayerWithoutCard[] = playerSummaries
    .filter((player) => !usedPlayers.has(player.playerKey))
    .map((player) => ({
      ...player,
      reason: player.seasonGames < BEST_OF_MIN_PLAYER_GAMES
        ? "player-threshold"
        : candidates.some((candidate) => candidate.playerKey === player.playerKey)
          ? "one-card-cap"
          : "champion-threshold",
    }));
  const unawardedChampions: BestOfUnawardedChampion[] = [...champions.entries()]
    .map(([championId, rows]) => {
      const champion = canonicalChampion(rows[0].champion);
      const hadCandidate = candidates.some((candidate) => candidate.championId === championId);
      return usedChampions.has(championId) ? null : {
        championId,
        champion: champion.displayName,
        reason: hadCandidate ? "one-card-cap" as const : "champion-threshold" as const,
      };
    })
    .filter((champion): champion is BestOfUnawardedChampion => champion !== null)
    .sort((left, right) => compareOrdinal(left.championId, right.championId));

  const presentation = selected.slice().sort((left, right) =>
    compareOrdinal(left.championId, right.championId) || compareOrdinal(left.playerKey, right.playerKey));

  return {
    candidates: orderedCandidates,
    selected,
    presentation,
    diagnostics: {
      playerThreshold: BEST_OF_MIN_PLAYER_GAMES,
      championThreshold: 1,
      totalPlayers: playerSummaries.length,
      eligiblePlayers: eligiblePlayerKeys.size,
      qualifyingCandidates: orderedCandidates.length,
      awardedPlayers: selected.length,
      awardedChampions: usedChampions.size,
      passCounts: {
        original: selected.filter((candidate) => candidate.selectionPass === "original").length,
        expansion: selected.filter((candidate) => candidate.selectionPass === "expansion").length,
        remaining: selected.filter((candidate) => candidate.selectionPass === "remaining").length,
      },
      playersBelowThreshold,
      playersWithoutCard,
      championsBelowThreshold: championExclusions.sort((left, right) => compareOrdinal(left.championId, right.championId)),
      contestedChampions,
      skippedCandidates,
      capPromotions,
      unawardedChampions,
    },
  };
}
