// A contest: one check, with its work shown.
//
// Every decision the match makes — a lane, an objective, a fight, the
// Baron smite — resolves through runContest, which records not just WHO
// won but BY HOW MUCH. That margin is the whole point: "you lost the
// Baron by 2" is feedback a player can act on, and "you lost" is not.
// (Football Manager's xG solves the same problem: separate the process
// from the result so a game you deserved to win reads as one.)
//
// The margin is never cosmetic and never staged — it is exactly the
// number the comparison used, so a near-miss on screen was a near-miss in
// the engine.

import type { MeasureKey } from "@/lib/cards/measures";
import type { GauntletRole } from "./sim";

/** What kind of beat this was — the timeline's grouping and the
 *  autopsy's vocabulary. */
export type ContestKind = "lane" | "objective" | "fight" | "crossroads" | "baron" | "hold" | "nexus";

export interface Contest {
  /** Stable id within a match: "dragon-14", "lane-Mid". */
  key: string;
  kind: ContestKind;
  /** Human label — "🐉 Ocean drake", "Baron smite". */
  label: string;
  clock: number;
  yourKeys: MeasureKey[];
  theirKeys: MeasureKey[];
  /** Your side of the check, every bonus already folded in. */
  yourVal: number;
  theirVal: number;
  /** The noise this check drew, signed toward your side. */
  roll: number;
  /** yourVal + roll − theirVal. Positive means you won, and by how much. */
  margin: number;
  won: boolean;
  /** Gold this beat moved, signed for your side. */
  goldSwing: number;
  /** Whose bars carried your side — the "decided by" credit. */
  decidedBy: string | null;
  role: GauntletRole | null;
}

export interface ContestInput {
  key: string;
  kind: ContestKind;
  label: string;
  clock: number;
  yourKeys: MeasureKey[];
  theirKeys: MeasureKey[];
  yourVal: number;
  theirVal: number;
  /** Full width of the noise band: the roll lands in ±spread/2. */
  spread: number;
  decidedBy?: string | null;
  role?: GauntletRole | null;
}

/**
 * Resolves one check. `rand` must come from the match's seeded stream —
 * the caller owns seed provenance, so every margin replays identically.
 */
export function runContest(input: ContestInput, rand: () => number): Contest {
  const roll = (rand() - 0.5) * input.spread;
  const margin = input.yourVal + roll - input.theirVal;
  return {
    key: input.key,
    kind: input.kind,
    label: input.label,
    clock: input.clock,
    yourKeys: input.yourKeys,
    theirKeys: input.theirKeys,
    yourVal: Math.round(input.yourVal * 10) / 10,
    theirVal: Math.round(input.theirVal * 10) / 10,
    roll: Math.round(roll * 10) / 10,
    margin: Math.round(margin * 10) / 10,
    won: margin >= 0,
    goldSwing: 0,
    decidedBy: input.decidedBy ?? null,
    role: input.role ?? null,
  };
}

/** The tape's own summary line for a contest — the numbers, in order. */
export function contestDetail(contest: Contest): string {
  const your = contest.yourKeys.length > 0 ? contest.yourKeys.join("+") : "auto";
  const their = contest.theirKeys.length > 0 ? contest.theirKeys.join("+") : "—";
  const sign = contest.margin >= 0 ? "+" : "";
  return `${your} ${contest.yourVal} vs ${their} ${contest.theirVal} · roll ${contest.roll >= 0 ? "+" : ""}${contest.roll} → ${sign}${contest.margin}`;
}
