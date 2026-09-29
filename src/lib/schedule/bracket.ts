import { normalizeTeamName } from "@/lib/league/context";
import { compareFixtures, formatKickoff, teamLabel } from "@/lib/schedule/format";
import type { FixtureRow, FixtureStage } from "@/lib/schedule/types";

export type BracketResultState = "pending" | "in-progress" | "final" | "invalid";
export type BracketPairingState = "confirmed" | "partial" | "unpublished";
export type BracketSide = "team_a" | "team_b";

export interface BracketMatch {
  fixtureId: string;
  stage: FixtureStage;
  order: number;
  teamA: string;
  teamB: string;
  scoreA: number | null;
  scoreB: number | null;
  bestOf: 1 | 3 | 5;
  scheduledAt: string | null;
  kickoffLabel: string;
  resultState: BracketResultState;
  winner: string | null;
}

export interface BracketRound {
  stage: "quarterfinals" | "semifinals" | "finals";
  label: string;
  matches: BracketMatch[];
}

export interface ConfirmedBracketEdge {
  sourceFixtureId: string;
  targetFixtureId: string;
  targetSide: BracketSide;
}

export interface BracketModel {
  season: string;
  rounds: BracketRound[];
  confirmedEdges: ConfirmedBracketEdge[];
  pairingState: BracketPairingState;
  champion: string | null;
}

const ROUND_DEFS = [
  { stage: "quarterfinals", label: "Quarterfinals" },
  { stage: "semifinals", label: "Semifinals" },
  { stage: "finals", label: "Final" },
] as const;

const NEXT_ROUND: Partial<Record<BracketRound["stage"], BracketRound["stage"]>> = {
  quarterfinals: "semifinals",
  semifinals: "finals",
};

function winnerFor(row: FixtureRow): { state: BracketResultState; winner: string | null } {
  const teamA = row.team_a?.trim();
  const teamB = row.team_b?.trim();
  if (row.score_a === null && row.score_b === null) return { state: "pending", winner: null };
  if (
    !teamA ||
    !teamB ||
    row.score_a === null ||
    row.score_b === null ||
    !Number.isInteger(row.score_a) ||
    !Number.isInteger(row.score_b) ||
    row.score_a < 0 ||
    row.score_b < 0 ||
    row.score_a === row.score_b
  ) {
    return { state: "invalid", winner: null };
  }

  const threshold = Math.ceil(row.best_of / 2);
  if (row.score_a >= threshold && row.score_a > row.score_b) return { state: "final", winner: teamA };
  if (row.score_b >= threshold && row.score_b > row.score_a) return { state: "final", winner: teamB };
  return { state: "in-progress", winner: null };
}

function toMatch(row: FixtureRow): BracketMatch {
  const result = winnerFor(row);
  return {
    fixtureId: row.id,
    stage: row.stage,
    order: row.sort_order,
    teamA: teamLabel(row.team_a),
    teamB: teamLabel(row.team_b),
    scoreA: row.score_a,
    scoreB: row.score_b,
    bestOf: row.best_of,
    scheduledAt: row.scheduled_at,
    kickoffLabel: formatKickoff(row.scheduled_at),
    resultState: result.state,
    winner: result.winner,
  };
}

function deriveEdges(rounds: BracketRound[]): ConfirmedBracketEdge[] {
  const edges: ConfirmedBracketEdge[] = [];
  for (const sourceRound of rounds) {
    const targetStage = NEXT_ROUND[sourceRound.stage];
    if (!targetStage) continue;
    const targetRound = rounds.find((round) => round.stage === targetStage);
    if (!targetRound) continue;

    for (const source of sourceRound.matches) {
      if (!source.winner) continue;
      const normalizedWinner = normalizeTeamName(source.winner);
      const matches = targetRound.matches.flatMap((target) => {
        const sides: { fixtureId: string; side: BracketSide }[] = [];
        if (normalizeTeamName(target.teamA) === normalizedWinner) sides.push({ fixtureId: target.fixtureId, side: "team_a" });
        if (normalizeTeamName(target.teamB) === normalizedWinner) sides.push({ fixtureId: target.fixtureId, side: "team_b" });
        return sides;
      });
      if (matches.length === 1) {
        edges.push({ sourceFixtureId: source.fixtureId, targetFixtureId: matches[0].fixtureId, targetSide: matches[0].side });
      }
    }
  }
  return edges;
}

function pairingState(rounds: BracketRound[], edges: ConfirmedBracketEdge[]): BracketPairingState {
  if (!rounds.some((round) => round.matches.length > 0)) return "unpublished";
  const sourceMatches = rounds.flatMap((round) => NEXT_ROUND[round.stage] ? round.matches : []);
  const sources = sourceMatches.filter((match) => match.winner !== null);
  const everyPublishedSourceHasWinner = sourceMatches.length > 0 && sources.length === sourceMatches.length;
  const allWinnersConnected = everyPublishedSourceHasWinner && sources.every((source) => edges.some((edge) => edge.sourceFixtureId === source.fixtureId));
  const allPublishedSidesFilled = rounds
    .filter((round) => round.stage !== "quarterfinals" || rounds.some((candidate) => candidate.stage === "quarterfinals"))
    .every((round) => round.matches.every((match) => match.teamA !== "TBD" && match.teamB !== "TBD"));
  return allWinnersConnected && allPublishedSidesFilled ? "confirmed" : "partial";
}

/** Build a read-only bracket from one already-scoped league season. */
export function buildBracketModel(rows: FixtureRow[], season: string): BracketModel {
  const seasonRows = rows.filter((row) => row.season === season);
  const rounds: BracketRound[] = ROUND_DEFS.map(({ stage, label }) => ({
    stage,
    label,
    matches: seasonRows
      .filter((row) => row.stage === stage)
      .sort(compareFixtures)
      .map(toMatch),
  }));
  const confirmedEdges = deriveEdges(rounds);
  const finalRound = rounds.find((round) => round.stage === "finals");
  const finalMatch = finalRound?.matches.length === 1 ? finalRound.matches[0] : null;
  return {
    season,
    rounds,
    confirmedEdges,
    pairingState: pairingState(rounds, confirmedEdges),
    champion: finalMatch?.resultState === "final" ? finalMatch.winner : null,
  };
}
