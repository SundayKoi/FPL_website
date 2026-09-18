// The gauntlet draw, straight from the Split 5 rulebook's "Gauntlet"
// section. Pure: seeds in, fixture drafts out, so the rules can be tested
// without a database and the admin panel stays a thin caller.
//
//   Round 1 (Bo1): Solari #5 v Lunari #6, and Lunari #5 v Solari #6.
//   Round 2 (Bo3): the two round-1 winners play the 4th seeds. Different
//     divisions -> each plays the OPPOSITE division's #4. Same division ->
//     the lower seed (the #6) plays its OWN division's #4 and the higher
//     seed (the #5) plays the other division's #4.
//
// Both rounds are on the same day, so every draft carries one kickoff.

import { normalizeTeamName } from "@/lib/league/context";
import { DIVISIONS, type Division } from "./types";

/** A division's teams in standings order — index 0 is the #1 seed. */
export type DivisionSeeds = Record<Division, string[]>;

export interface GauntletFixtureDraft {
  stage: "gauntlet_r1" | "gauntlet_r2";
  /** Always cross-division: every gauntlet pairing crosses the divisions,
   *  and the same-division round-2 case is still a Solari/Lunari bracket. */
  division: null;
  team_a: string;
  team_b: string | null;
  best_of: 1 | 3;
  /** 0 or 1 within the round. */
  sort_order: number;
  scheduled_at: string | null;
}

/** Zero-based indexes for the rulebook's 4th, 5th and 6th seeds. */
const FOURTH = 3;
const FIFTH = 4;
const SIXTH = 5;
const GAUNTLET_SIZE = 6;

const OPPOSITE: Record<Division, Division> = { Solari: "Lunari", Lunari: "Solari" };

/**
 * Seeds from an ordered standings list (already sorted by the league's
 * tiebreakers — `deriveSeriesStandings` does that). Seed N of a division is
 * the Nth team of that division in that order.
 *
 * Throws rather than drawing a partial gauntlet: a bracket built off a
 * division missing its 6th seed would pair the wrong teams silently.
 */
export function seedsFromStandings(
  rows: { name: string; division: string | null }[],
): DivisionSeeds {
  const unassigned = rows.filter((row) => !row.division?.trim()).map((row) => row.name);
  if (unassigned.length > 0) {
    throw new Error(
      `These teams have no division, so they cannot be seeded: ${unassigned.join(", ")}.`,
    );
  }

  const seeds = { Solari: [], Lunari: [] } as DivisionSeeds;
  for (const row of rows) {
    const division = DIVISIONS.find((d) => d === row.division);
    if (!division) {
      throw new Error(`"${row.name}" is in an unknown division "${row.division}".`);
    }
    seeds[division].push(row.name);
  }

  for (const division of DIVISIONS) {
    if (seeds[division].length < GAUNTLET_SIZE) {
      throw new Error(
        `${division} has only ${seeds[division].length} team${seeds[division].length === 1 ? "" : "s"} ` +
          `in the standings — the gauntlet needs ${GAUNTLET_SIZE} seeds per division.`,
      );
    }
  }

  return seeds;
}

/**
 * Round 1 (Solari #5 v Lunari #6, Lunari #5 v Solari #6, Bo1) plus the
 * round-2 placeholders (Solari #4 v TBD, Lunari #4 v TBD, Bo3). The #4 seed
 * is `team_a` so the placeholder still names a real team; `team_b` stays
 * null until round 1 is played, which is also what makes the Send-off skip
 * the row rather than print a phantom loser.
 */
export function drawGauntlet(seeds: DivisionSeeds, kickoff: string | null): GauntletFixtureDraft[] {
  return [
    {
      stage: "gauntlet_r1",
      division: null,
      team_a: seeds.Solari[FIFTH],
      team_b: seeds.Lunari[SIXTH],
      best_of: 1,
      sort_order: 0,
      scheduled_at: kickoff,
    },
    {
      stage: "gauntlet_r1",
      division: null,
      team_a: seeds.Lunari[FIFTH],
      team_b: seeds.Solari[SIXTH],
      best_of: 1,
      sort_order: 1,
      scheduled_at: kickoff,
    },
    {
      stage: "gauntlet_r2",
      division: null,
      team_a: seeds.Solari[FOURTH],
      team_b: null,
      best_of: 3,
      sort_order: 0,
      scheduled_at: kickoff,
    },
    {
      stage: "gauntlet_r2",
      division: null,
      team_a: seeds.Lunari[FOURTH],
      team_b: null,
      best_of: 3,
      sort_order: 1,
      scheduled_at: kickoff,
    },
  ];
}

export interface RoundOneResult {
  team_a: string;
  team_b: string;
  score_a: number;
  score_b: number;
}

/** A round-1 fixture as the result resolver reads it. */
export interface RoundOneFixtureScore {
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
}

/** A captain's report for that fixture, with its two sides already resolved
 *  from `league_teams` ids to names. The scores are in the REPORT's own side
 *  order, which is whichever team the captain happened to enter first. */
export interface RoundOneReport {
  team_a: string | null;
  team_b: string | null;
  score_a: number;
  score_b: number;
}

export interface ResolvedRoundOne {
  /** The result in the FIXTURE's side order, or null when there is none. */
  result: RoundOneResult | null;
  source: "fixture" | "report" | null;
  /** Why there is no usable result, when the reason is worth saying. */
  note: string | null;
}

const fixtureLabel = (fixture: RoundOneFixtureScore) =>
  `${fixture.team_a ?? "TBD"} vs ${fixture.team_b ?? "TBD"}`;

/**
 * One round-1 series' result, from the fixture's own score when it has one
 * and otherwise from a captain's report.
 *
 * Both gauntlet rounds are played the same evening and the stats ingest does
 * not run between them, so on the night the round-1 fixtures are still
 * unscored and the only record of who won is the report the captains filed.
 *
 * A report's `team_a` is whichever side the captain entered first, which need
 * not be the fixture's `team_a`, so the score is aligned to the fixture's side
 * order exactly the way `sync_fixture_score` does in
 * `scripts/riot_stats_ingest.py`: swap when the sides are reversed, and take
 * NO result when they cannot be matched by name — a silently reversed result
 * would send the wrong team into round 2. A tie (including 0-0) is not a
 * result either.
 */
export function resolveRoundOneResult(
  fixture: RoundOneFixtureScore,
  report: RoundOneReport | null,
): ResolvedRoundOne {
  const label = fixtureLabel(fixture);
  const none = (note: string | null): ResolvedRoundOne => ({ result: null, source: null, note });

  if (!fixture.team_a || !fixture.team_b) {
    return none(`${label} has no teams yet.`);
  }

  if (fixture.score_a !== null && fixture.score_b !== null) {
    if (fixture.score_a === fixture.score_b) {
      return none(`${label} is ${fixture.score_a}-${fixture.score_b}, which is not a result.`);
    }
    return {
      result: {
        team_a: fixture.team_a,
        team_b: fixture.team_b,
        score_a: fixture.score_a,
        score_b: fixture.score_b,
      },
      source: "fixture",
      note: null,
    };
  }

  if (!report) return none(null);

  const fixtureA = normalizeTeamName(fixture.team_a);
  const fixtureB = normalizeTeamName(fixture.team_b);
  const reportA = normalizeTeamName(report.team_a);
  const reportB = normalizeTeamName(report.team_b);
  if (!reportA || !reportB) {
    return none(`${label}: the captain's report does not name both teams, so it cannot be aligned.`);
  }

  let scoreA = report.score_a;
  let scoreB = report.score_b;
  if (fixtureA === reportB && fixtureB === reportA) {
    [scoreA, scoreB] = [scoreB, scoreA];
  } else if (!(fixtureA === reportA && fixtureB === reportB)) {
    return none(
      `${label}: the captain's report is for ${report.team_a} vs ${report.team_b}, ` +
        `so its score cannot be aligned to this fixture.`,
    );
  }

  if (scoreA === scoreB) {
    return none(`${label} is reported ${scoreA}-${scoreB}, which is not a result.`);
  }

  return {
    result: { team_a: fixture.team_a, team_b: fixture.team_b, score_a: scoreA, score_b: scoreB },
    source: "report",
    note: null,
  };
}

/** Where a round-1 entrant sits: which division and which seed number. */
interface Entrant {
  division: Division;
  seed: 5 | 6;
  name: string;
}

function entrantsOf(seeds: DivisionSeeds): Map<string, Entrant> {
  const entrants = new Map<string, Entrant>();
  for (const division of DIVISIONS) {
    entrants.set(normalizeTeamName(seeds[division][FIFTH]), {
      division,
      seed: 5,
      name: seeds[division][FIFTH],
    });
    entrants.set(normalizeTeamName(seeds[division][SIXTH]), {
      division,
      seed: 6,
      name: seeds[division][SIXTH],
    });
  }
  return entrants;
}

/**
 * The two round-2 pairings from round 1's results. Each entry names the #4
 * seed as `team_a` and the winner it draws as `team_b`, so a caller can
 * update the placeholder rows in place by matching on `team_a`.
 *
 * Throws when a result is undecided or names a team that never entered
 * round 1 — better a refused seeding than a bracket nobody can explain.
 */
export function seedRoundTwo(
  seeds: DivisionSeeds,
  roundOne: RoundOneResult[],
): { team_a: string; team_b: string }[] {
  if (roundOne.length !== 2) {
    throw new Error(`Round 1 has ${roundOne.length} results — the gauntlet needs both before round 2 can be seeded.`);
  }

  const entrants = entrantsOf(seeds);
  const winners: Entrant[] = [];

  for (const result of roundOne) {
    if (result.score_a === result.score_b) {
      throw new Error(
        `${result.team_a} vs ${result.team_b} is undecided (${result.score_a}-${result.score_b}) — ` +
          `report round 1 before seeding round 2.`,
      );
    }
    const winnerName = result.score_a > result.score_b ? result.team_a : result.team_b;
    const entrant = entrants.get(normalizeTeamName(winnerName));
    if (!entrant) {
      throw new Error(`"${winnerName}" is not one of the round-1 seeds, so round 2 cannot be drawn.`);
    }
    winners.push(entrant);
  }

  if (normalizeTeamName(winners[0].name) === normalizeTeamName(winners[1].name)) {
    throw new Error(`"${winners[0].name}" won both round-1 series — check the reported results.`);
  }

  // Different divisions: each winner crosses to the other division's #4.
  if (winners[0].division !== winners[1].division) {
    return winners.map((winner) => ({
      team_a: seeds[OPPOSITE[winner.division]][FOURTH],
      team_b: winner.name,
    }));
  }

  // Same division: the lower seed (#6) stays home against its own #4, the
  // higher seed (#5) travels to the other division's #4.
  const division = winners[0].division;
  const lower = winners.find((w) => w.seed === 6);
  const higher = winners.find((w) => w.seed === 5);
  if (!lower || !higher) {
    throw new Error(
      `Both round-1 winners are ${division}'s #${winners[0].seed} seed — check the reported results.`,
    );
  }
  return [
    { team_a: seeds[division][FOURTH], team_b: lower.name },
    { team_a: seeds[OPPOSITE[division]][FOURTH], team_b: higher.name },
  ];
}
