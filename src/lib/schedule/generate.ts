import { DIVISIONS, type Division, type FixtureStage } from "./types";

/** A team as the generator needs it. Fixtures store names as text, not ids. */
export interface GeneratorTeam {
  name: string;
  division: Division | null;
}

export interface GeneratedFixture {
  stage: FixtureStage;
  division: Division;
  team_a: string;
  team_b: string;
  best_of: 3;
  sort_order: number;
  scheduled_at: string | null;
}

/** Weeks the regular season has room for. A division of N teams needs N-1. */
const WEEKS: FixtureStage[] = ["week_1", "week_2", "week_3", "week_4", "week_5"];
const WEEK_MS = 7 * 24 * 60 * 60 * 1000;

function shuffle<T>(items: T[], rng: () => number): T[] {
  const out = items.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Circle method: pin the first team, rotate the rest. Produces a schedule
 *  where every team meets every other exactly once across n-1 rounds. */
function roundRobin(names: (string | null)[]): [string | null, string | null][][] {
  const n = names.length;
  const rounds: [string | null, string | null][][] = [];
  let rotating = names.slice(1);
  for (let r = 0; r < n - 1; r++) {
    const ring = [names[0], ...rotating];
    const pairs: [string | null, string | null][] = [];
    for (let i = 0; i < n / 2; i++) {
      pairs.push([ring[i], ring[n - 1 - i]]);
    }
    rounds.push(pairs);
    rotating = [rotating[rotating.length - 1], ...rotating.slice(0, -1)];
  }
  return rounds;
}

/**
 * Build a full intra-division regular season: inside each division every team
 * plays every other exactly once, one match per team per week.
 *
 * The draw is random — the teams are shuffled before the rotation — so who
 * meets whom in week 1 differs each time, while the round-robin guarantee
 * holds regardless.
 *
 * Throws rather than producing a partial schedule, because a half-built season
 * is worse than none: the pairings are what everything downstream trusts.
 */
export function generateRegularSeason(
  teams: GeneratorTeam[],
  opts: { startsAt?: Date | null; rng?: () => number } = {}
): GeneratedFixture[] {
  const rng = opts.rng ?? Math.random;
  const startsAt = opts.startsAt ?? null;

  const unassigned = teams.filter((t) => !t.division);
  if (unassigned.length > 0) {
    throw new Error(
      `These teams have no division yet: ${unassigned.map((t) => t.name).join(", ")}. ` +
        `Run the nemesis draft or set divisions on the teams page first.`
    );
  }

  const seen = new Set<string>();
  for (const t of teams) {
    if (seen.has(t.name)) {
      throw new Error(`Two teams are both called "${t.name}" — fixtures identify teams by name.`);
    }
    seen.add(t.name);
  }

  const fixtures: GeneratedFixture[] = [];

  for (const division of DIVISIONS) {
    const names = teams.filter((t) => t.division === division).map((t) => t.name);
    if (names.length === 0) continue;
    if (names.length < 2) {
      throw new Error(`${division} has only ${names.length} team — it needs at least 2.`);
    }

    // An odd division gets a bye each round, which is what the null stands for.
    const entrants: (string | null)[] = shuffle(names, rng);
    if (entrants.length % 2 === 1) entrants.push(null);

    const rounds = roundRobin(entrants);
    if (rounds.length > WEEKS.length) {
      throw new Error(
        `${division} has ${names.length} teams, which needs ${rounds.length} weeks, ` +
          `but the season only has ${WEEKS.length}.`
      );
    }

    rounds.forEach((pairs, weekIndex) => {
      const playable = pairs.filter((p): p is [string, string] => p[0] !== null && p[1] !== null);
      playable.forEach(([a, b], i) => {
        fixtures.push({
          stage: WEEKS[weekIndex],
          division,
          team_a: a,
          team_b: b,
          best_of: 3,
          // Sorted per week across both divisions; callers renumber if they
          // care about ordering between divisions.
          sort_order: i,
          scheduled_at: startsAt
            ? new Date(startsAt.getTime() + weekIndex * WEEK_MS).toISOString()
            : null,
        });
      });
    });
  }

  return fixtures;
}
