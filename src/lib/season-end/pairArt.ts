import { championByName } from "@/lib/match-draft/champions";
import { cardPlayerKey } from "@/lib/cards/build";
import { canonicalChampion } from "./best-of";
import type { DuoChampionEvidence, DuoMemberEvidence } from "./duo";
import type { SeasonRow } from "./derive";

export type PairArtRole = "Top" | "Jungle" | "Mid" | "Bot" | "Support";
export interface PairArtAppearance {
  playerKey: string;
  playerName: string;
  team: string;
  role: PairArtRole;
  champion: string;
  win: boolean;
  performance: number | null;
}
export interface PairArtChampion {
  id: string;
  name: string;
  games: number;
  wins: number;
  /** Fractional win rate retained for the cosmetic selector contract. */
  winRate: number;
  meanPerformance?: number;
}
export interface PairArtMember {
  playerKey: string;
  name: string;
  role: PairArtRole;
  champion: PairArtChampion | null;
}

const teamKey = (team: string) => team.trim().toLowerCase();
const finite = (rowOrValue: SeasonRow | unknown, field?: string): number | null => {
  const value = field ? (rowOrValue as SeasonRow)[field] : rowOrValue;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
};

function compareOrdinal(left: string, right: string): number {
  const length = Math.min(left.length, right.length);
  for (let index = 0; index < length; index += 1) {
    const difference = left.charCodeAt(index) - right.charCodeAt(index);
    if (difference) return difference;
  }
  return left.length - right.length;
}

/** Select one cosmetic champion independently for a duo member. */
export function selectPairChampion(
  rows: readonly SeasonRow[],
  member: Pick<DuoMemberEvidence, "playerKey" | "role">,
  team: string,
): DuoChampionEvidence | null {
  const candidateRows = rows.filter((row) =>
    cardPlayerKey(row.summoner_name, row.tag) === member.playerKey &&
    teamKey(row.team_name) === teamKey(team) &&
    row.role === member.role &&
    typeof row.champion === "string" &&
    row.champion.trim().length > 0,
  );
  const candidates = new Map<string, SeasonRow[]>();
  for (const row of candidateRows) {
    const champion = canonicalChampion(row.champion.trim());
    candidates.set(champion.id, [...(candidates.get(champion.id) ?? []), row]);
  }
  if (!candidates.size) return null;

  // If one candidate is missing the optional performance tie-break, omit that
  // tie-break for this member rather than making coverage order-dependent.
  const performanceCovered = [...candidates.values()].every((candidate) => candidate.every((row) => finite(row, "performance") !== null));
  const summaries = [...candidates.entries()].map(([championId, championRows]) => {
    const champion = canonicalChampion(championRows[0].champion.trim());
    const wins = championRows.filter((row) => row.win).length;
    const meanPerformance = performanceCovered
      ? championRows.reduce((total, row) => total + finite(row, "performance")!, 0) / championRows.length
      : undefined;
    return {
      championId,
      champion: champion.displayName,
      games: championRows.length,
      wins,
      losses: championRows.length - wins,
      winRate: 100 * wins / championRows.length,
      ...(meanPerformance === undefined ? {} : { meanPerformance }),
    };
  });

  summaries.sort((left, right) => {
    if (left.wins !== right.wins) return right.wins - left.wins;
    const rightRate = BigInt(right.wins) * BigInt(left.games);
    const leftRate = BigInt(left.wins) * BigInt(right.games);
    if (rightRate !== leftRate) return rightRate > leftRate ? 1 : -1;
    if (performanceCovered && left.meanPerformance !== undefined && right.meanPerformance !== undefined && left.meanPerformance !== right.meanPerformance) {
      return right.meanPerformance - left.meanPerformance;
    }
    return compareOrdinal(left.championId, right.championId);
  });

  return summaries[0] ?? null;
}

function selectPairArtChampion(appearances: readonly PairArtAppearance[], member: Pick<PairArtMember, "playerKey" | "role">): PairArtChampion | null {
  const candidates = new Map<string, PairArtAppearance[]>();
  for (const appearance of appearances) {
    if (appearance.playerKey !== member.playerKey || appearance.role !== member.role || !appearance.champion.trim()) continue;
    const champion = canonicalChampion(appearance.champion.trim());
    candidates.set(champion.id, [...(candidates.get(champion.id) ?? []), appearance]);
  }
  if (!candidates.size) return null;

  const performanceCovered = [...candidates.values()].every((candidate) => candidate.every((row) => finite(row.performance) !== null));
  const summaries = [...candidates.entries()].map(([id, rows]) => {
    const champion = canonicalChampion(rows[0].champion.trim());
    const wins = rows.filter((row) => row.win).length;
    return {
      id,
      name: champion.displayName,
      games: rows.length,
      wins,
      winRate: wins / rows.length,
      ...(performanceCovered ? { meanPerformance: rows.reduce((total, row) => total + finite(row.performance)!, 0) / rows.length } : {}),
    };
  });
  summaries.sort((left, right) => {
    if (left.wins !== right.wins) return right.wins - left.wins;
    const rightRate = BigInt(right.wins) * BigInt(left.games);
    const leftRate = BigInt(left.wins) * BigInt(right.games);
    if (rightRate !== leftRate) return rightRate > leftRate ? 1 : -1;
    if (performanceCovered && left.meanPerformance !== undefined && right.meanPerformance !== undefined && left.meanPerformance !== right.meanPerformance) {
      return right.meanPerformance - left.meanPerformance;
    }
    return compareOrdinal(left.id, right.id);
  });
  return summaries[0] ?? null;
}

export function selectPairArt({
  team,
  members,
  appearances,
}: {
  team: string;
  members: readonly Pick<PairArtMember, "playerKey" | "name" | "role">[];
  appearances: readonly PairArtAppearance[];
}): [PairArtMember, PairArtMember] {
  const scoped = appearances.filter((appearance) => teamKey(appearance.team) === teamKey(team));
  return members.map((member) => ({ ...member, champion: selectPairArtChampion(scoped, member) })) as [PairArtMember, PairArtMember];
}

export function withPairChampionEvidence(
  rows: readonly SeasonRow[],
  members: readonly [DuoMemberEvidence, DuoMemberEvidence],
  team: string,
): [DuoMemberEvidence, DuoMemberEvidence] {
  return members.map((member) => ({
    ...member,
    champion: selectPairChampion(rows, member, team),
  })) as [DuoMemberEvidence, DuoMemberEvidence];
}

/** Unknown champions deliberately return no URL; the card renders a neutral panel. */
export function pairChampionHasArt(champion: DuoChampionEvidence | null): boolean {
  return Boolean(champion && championByName(champion.champion));
}
