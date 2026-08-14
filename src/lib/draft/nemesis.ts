import type { Division } from "@/lib/schedule/types";
import type { NemesisPick, Team } from "./types";

export type NemesisPhase = "not_started" | "live" | "complete";

export interface NemesisState {
  phase: NemesisPhase;
  onTheClockTeamId: string | null;
  nextDivision: Division | null;
  /** Placed teams in pick order, seed first. */
  placed: Team[];
  unplaced: Team[];
  byDivision: Record<Division, Team[]>;
}

export function otherDivision(division: Division): Division {
  return division === "Lunari" ? "Solari" : "Lunari";
}

/** Everything the board needs, derived from the picks alone. The clock is
 *  never stored, so an undone pick rewinds it by definition. */
export function nemesisState(teams: Team[], picks: NemesisPick[]): NemesisState {
  const inOrder = [...picks].sort((a, b) => a.pick_number - b.pick_number);
  const byId = new Map(teams.map((t) => [t.id, t]));

  const placed: Team[] = [];
  const byDivision: Record<Division, Team[]> = { Lunari: [], Solari: [] };
  let lastValidPick: NemesisPick | null = null;
  for (const p of inOrder) {
    const t = byId.get(p.chosen_team_id);
    if (!t) continue; // a pick for a team since removed from the draft
    placed.push(t);
    byDivision[p.division].push(t);
    lastValidPick = p;
  }

  const placedIds = new Set(placed.map((t) => t.id));
  const unplaced = teams.filter((t) => !placedIds.has(t.id));

  const phase: NemesisPhase =
    inOrder.length === 0 ? "not_started" : placed.length >= teams.length ? "complete" : "live";

  return {
    phase,
    onTheClockTeamId: phase === "live" && lastValidPick ? lastValidPick.chosen_team_id : null,
    nextDivision: phase === "live" && lastValidPick ? otherDivision(lastValidPick.division) : null,
    placed,
    unplaced,
    byDivision,
  };
}
