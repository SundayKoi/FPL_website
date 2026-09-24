import type { BracketFixture, WinnerDestination } from "./bracketSeed";

/** The fields read from an existing scheduled fixture. */
export interface PlayoffFixtureResult extends BracketFixture {
  id: string;
  score_a: number | null;
  score_b: number | null;
  resultEvidence: "verified" | "pending" | "conflict";
}

export interface PlayoffAdvancementUpdate {
  id: string;
  stage: BracketFixture["stage"];
  sort_order: number;
  destination: WinnerDestination;
  winner: string;
}

export interface PlayoffAdvancementPlan {
  updates: PlayoffAdvancementUpdate[];
  alreadySet: PlayoffAdvancementUpdate[];
  pending: string[];
  conflicts: string[];
}

const slotKey = (stage: BracketFixture["stage"], sortOrder: number) => `${stage}#${sortOrder}`;
const slotLabel = (stage: BracketFixture["stage"], sortOrder: number) => `${stage} #${sortOrder}`;

/**
 * Resolve completed fixtures into the explicitly configured next-round slots.
 * A round is complete only when its winner has reached the Bo threshold and
 * the loser has not. This leaves partial or contradictory scores untouched.
 */
export function planPlayoffAdvancement(
  existing: PlayoffFixtureResult[],
  bracket: BracketFixture[],
): PlayoffAdvancementPlan {
  const result: PlayoffAdvancementPlan = { updates: [], alreadySet: [], pending: [], conflicts: [] };
  const rows = new Map(existing.map((fixture) => [slotKey(fixture.stage, fixture.sort_order), fixture]));
  const config = new Map(bracket.map((fixture) => [slotKey(fixture.stage, fixture.sort_order), fixture]));

  for (const fixture of bracket) {
    const destination = fixture.winner_to;
    if (!destination) continue;

    const label = slotLabel(fixture.stage, fixture.sort_order);
    const current = rows.get(slotKey(fixture.stage, fixture.sort_order));
    if (!current) {
      result.conflicts.push(`${label} is configured in the bracket but missing from the season schedule.`);
      continue;
    }
    if (current.resultEvidence === "pending") {
      result.pending.push(`${label} has no clean, completed match-report ingest yet.`);
      continue;
    }
    if (current.resultEvidence === "conflict") {
      result.conflicts.push(`${label} has an ingested match-report warning; review it before advancing a team.`);
      continue;
    }
    if (current.score_a === null || current.score_b === null) {
      result.pending.push(`${label} has no complete result yet.`);
      continue;
    }
    if (current.best_of !== fixture.best_of) {
      result.conflicts.push(`${label} is scheduled Bo${current.best_of}, but the bracket file expects Bo${fixture.best_of}.`);
      continue;
    }
    if ((fixture.team_a && current.team_a !== fixture.team_a) || (fixture.team_b && current.team_b !== fixture.team_b)) {
      result.conflicts.push(`${label} does not match the bracket's seeded teams.`);
      continue;
    }
    if (!current.team_a || !current.team_b) {
      result.conflicts.push(`${label} has a score but is missing one of its teams.`);
      continue;
    }
    if (current.score_a === current.score_b) {
      result.conflicts.push(`${label} is tied ${current.score_a}-${current.score_b}; no winner can advance.`);
      continue;
    }

    const needed = Math.floor(fixture.best_of / 2) + 1;
    const winner = current.score_a > current.score_b ? current.team_a : current.team_b;
    const winnerScore = Math.max(current.score_a, current.score_b);
    const loserScore = Math.min(current.score_a, current.score_b);
    if (winnerScore !== needed || loserScore >= needed) {
      result.conflicts.push(
        `${label} has ${current.score_a}-${current.score_b}, which does not end a Bo${fixture.best_of} series at ${needed} wins.`,
      );
      continue;
    }

    const targetLabel = slotLabel(destination.stage, destination.sort_order);
    const targetConfig = config.get(slotKey(destination.stage, destination.sort_order));
    const target = rows.get(slotKey(destination.stage, destination.sort_order));
    if (!targetConfig || !target) {
      result.conflicts.push(`${label} advances to ${targetLabel}, which is missing from the season schedule.`);
      continue;
    }
    const otherSide = destination.side === "team_a" ? "team_b" : "team_a";
    if (targetConfig[otherSide] && target[otherSide] !== targetConfig[otherSide]) {
      result.conflicts.push(`${targetLabel} ${otherSide} no longer matches the bracket's seeded team ${targetConfig[otherSide]}.`);
      continue;
    }
    if (target.score_a !== null || target.score_b !== null) {
      if (target[destination.side] === winner) {
        result.alreadySet.push({ id: target.id, stage: target.stage, sort_order: target.sort_order, destination, winner });
      } else {
        result.conflicts.push(`${targetLabel} is already scored and its ${destination.side} is not ${winner}.`);
      }
      continue;
    }

    const currentTarget = target[destination.side];
    if (currentTarget && currentTarget !== winner) {
      result.conflicts.push(`${targetLabel} ${destination.side} is already ${currentTarget}, not ${winner}.`);
      continue;
    }
    if (target[otherSide] === winner) {
      result.conflicts.push(`${targetLabel} already has ${winner} in ${otherSide}; refusing a duplicate pairing.`);
      continue;
    }

    const update = { id: target.id, stage: destination.stage, sort_order: destination.sort_order, destination, winner };
    if (currentTarget === winner) result.alreadySet.push(update);
    else result.updates.push(update);
  }

  return result;
}
