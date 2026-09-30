import { cardPlayerKey } from "@/lib/cards/build";
import { canonicalChampion, compareOrdinal } from "./best-of";
import type { DuoChampionEvidence, DuoMemberEvidence } from "./duo";
import type { SeasonRow } from "./derive";
import { finiteField, teamKey } from "./rowKeys";

export type PairArtRole = "Top" | "Jungle" | "Mid" | "Bot" | "Support";
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
  const performanceCovered = [...candidates.values()].every((candidate) => candidate.every((row) => finiteField(row, "performance") !== null));
  const summaries = [...candidates.entries()].map(([championId, championRows]) => {
    const champion = canonicalChampion(championRows[0].champion.trim());
    const wins = championRows.filter((row) => row.win).length;
    const meanPerformance = performanceCovered
      ? championRows.reduce((total, row) => total + finiteField(row, "performance")!, 0) / championRows.length
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
