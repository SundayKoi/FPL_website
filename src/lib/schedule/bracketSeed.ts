/**
 * Seeding a playoff bracket from a file: the decisions, without a database.
 *
 * A bracket arrives as a JSON file in the repo (scripts/data/brackets/*.json)
 * because the league owner cannot run SQL, and the rows it describes have to
 * land on `public.fixtures` exactly once however many times the seeding job
 * is run. Everything that decides what happens to a row lives here so it can
 * be tested; scripts/seed-bracket.ts only reads, writes and prints.
 *
 * Two rules do the work:
 *
 * 1. **The key is `(season, stage, sort_order)`.** That is how a bracket row
 *    names itself, so a re-run rewrites the row it wrote last time instead of
 *    stacking a second quarterfinal #0 beside the first. Nothing is ever
 *    deleted — a fixture the file stopped mentioning is somebody else's row.
 *
 * 2. **A scored row is finished.** Once a result is in, the fixture is what
 *    the send-off reads to decide who was eliminated that week
 *    (src/lib/cards/sendoff.ts), and re-seeding a kickoff or a `best_of` over
 *    a played series would rewrite history. Scored rows are reported and left
 *    alone, column for column.
 *
 * Team names are checked before any of that. `fixtures.team_a`/`team_b` are
 * `league_teams.name` spellings, which is also what `raw_stats.team_name` and
 * therefore a card's `teamName` carry, and nothing in the database enforces
 * the match — a misspelt fixture simply prints nobody's send-off. So a name
 * the league does not know is an error that fails the whole run, and a name
 * that matches is written back in the `league_teams` spelling rather than the
 * file's.
 */
import { normalizeTeamName } from "../league/context";
import { FIXTURE_STAGES, type FixtureStage } from "./types";

const BEST_OF = [1, 3, 5] as const;
export type BestOf = (typeof BEST_OF)[number];

/** One matchup as a bracket file writes it. `null` is a TBD slot: a bye's
 *  opponent, or a final whose finalists are not known yet. */
export interface BracketFixture {
  stage: FixtureStage;
  sort_order: number;
  team_a: string | null;
  team_b: string | null;
  best_of: BestOf;
  scheduled_at: string | null;
}

export interface BracketFile {
  /** Which league's season the bracket belongs to, when the file does not
   *  name a season outright. */
  league: "premier" | "academy";
  /** An explicit season code, which wins over `league`. */
  season?: string | null;
  note?: string | null;
  fixtures: BracketFixture[];
}

/** The columns a seeded row owns. `division` is null on purpose: playoff
 *  matchups cross divisions (20260811000003_fixtures.sql). */
export interface BracketSeedRow {
  season: string;
  stage: FixtureStage;
  division: null;
  team_a: string | null;
  team_b: string | null;
  best_of: BestOf;
  scheduled_at: string | null;
  sort_order: number;
}

/** As much of a `fixtures` row as the plan needs to recognise it. */
export interface ExistingFixture {
  id: string;
  stage: FixtureStage;
  sort_order: number;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
}

export interface BracketSeedUpdate {
  id: string;
  row: BracketSeedRow;
}

/** A row the bracket describes that is already played. */
export interface BracketSeedSkip {
  id: string;
  stage: FixtureStage;
  sort_order: number;
  /** The teams and result as the database has them, for the log line. */
  played: string;
}

export interface BracketSeedPlan {
  inserts: BracketSeedRow[];
  updates: BracketSeedUpdate[];
  skips: BracketSeedSkip[];
  /** Every reason the run must not write anything, collected rather than
   *  thrown one at a time — one pass should list all the misspellings. */
  errors: string[];
}

const key = (stage: FixtureStage, sortOrder: number): string => `${stage}#${sortOrder}`;

const label = (stage: FixtureStage, sortOrder: number): string => `${stage} #${sortOrder}`;

/** normalized name -> the `league_teams` spelling to write. */
function spellings(teamNames: string[]): Map<string, string> {
  const map = new Map<string, string>();
  for (const name of teamNames) {
    const normalized = normalizeTeamName(name);
    if (normalized && !map.has(normalized)) map.set(normalized, name);
  }
  return map;
}

/**
 * What seeding `fixtures` with this bracket would do.
 *
 * `existing` is every fixture already on the season (the caller reads them
 * by season, so the season half of the key is already satisfied). The plan is
 * only trustworthy when `errors` is empty — a caller that writes anyway is
 * writing rows whose team names the league does not recognise.
 */
export function planBracketSeed(
  existing: ExistingFixture[],
  fixtures: BracketFixture[],
  season: string,
  teamNames: string[],
): BracketSeedPlan {
  const plan: BracketSeedPlan = { inserts: [], updates: [], skips: [], errors: [] };
  const known = spellings(teamNames);
  const byKey = new Map(existing.map((row) => [key(row.stage, row.sort_order), row]));
  const seen = new Set<string>();

  for (const fixture of fixtures) {
    const at = label(fixture.stage, fixture.sort_order);
    const slot = key(fixture.stage, fixture.sort_order);
    if (seen.has(slot)) {
      // Two rows claiming one slot cannot both be seeded: the second would
      // overwrite the first on the next run, so the file is wrong now.
      plan.errors.push(`${at}: the bracket lists this slot twice — (season, stage, sort_order) has to be unique.`);
      continue;
    }
    seen.add(slot);

    // Resolve both names first: a fixture with a bad name contributes an
    // error and no row, so a failed run never half-seeds a round.
    const sides: (string | null)[] = [];
    let named = true;
    for (const [side, name] of [["team_a", fixture.team_a], ["team_b", fixture.team_b]] as const) {
      if (name === null || name === undefined) {
        sides.push(null);
        continue;
      }
      const matched = known.get(normalizeTeamName(name));
      if (!matched) {
        plan.errors.push(`${at}: no league_teams row is called "${name}" (${side}).`);
        named = false;
        continue;
      }
      sides.push(matched);
    }
    if (!named) continue;

    const row: BracketSeedRow = {
      season,
      stage: fixture.stage,
      division: null,
      team_a: sides[0] ?? null,
      team_b: sides[1] ?? null,
      best_of: fixture.best_of,
      scheduled_at: fixture.scheduled_at,
      sort_order: fixture.sort_order,
    };

    const current = byKey.get(slot);
    if (!current) {
      plan.inserts.push(row);
      continue;
    }
    if (current.score_a !== null || current.score_b !== null) {
      plan.skips.push({
        id: current.id,
        stage: fixture.stage,
        sort_order: fixture.sort_order,
        played: `${current.team_a ?? "TBD"} ${current.score_a ?? "?"}–${current.score_b ?? "?"} ${current.team_b ?? "TBD"}`,
      });
      continue;
    }
    plan.updates.push({ id: current.id, row });
  }

  return plan;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

/**
 * A bracket file, checked into the shape the planner expects.
 *
 * Hand-written JSON gets hand-written mistakes, and a bad `stage` reaches
 * Postgres as an unknown enum value with an error that names neither the file
 * nor the row. Throws on the first structural problem instead.
 */
export function parseBracketFile(raw: unknown): BracketFile {
  if (!isRecord(raw)) throw new Error("A bracket file must be a JSON object.");
  const league = raw.league;
  if (league !== "premier" && league !== "academy") {
    throw new Error(`"league" must be "premier" or "academy", got ${JSON.stringify(league)}.`);
  }
  if (raw.season !== undefined && raw.season !== null && typeof raw.season !== "string") {
    throw new Error(`"season" must be a string when given, got ${JSON.stringify(raw.season)}.`);
  }
  if (!Array.isArray(raw.fixtures) || raw.fixtures.length === 0) {
    throw new Error(`"fixtures" must be a non-empty array.`);
  }

  const fixtures = raw.fixtures.map((entry, index) => {
    if (!isRecord(entry)) throw new Error(`fixtures[${index}] must be an object.`);
    const stage = entry.stage;
    if (typeof stage !== "string" || !(FIXTURE_STAGES as readonly string[]).includes(stage)) {
      throw new Error(`fixtures[${index}].stage must be one of ${FIXTURE_STAGES.join(", ")}; got ${JSON.stringify(stage)}.`);
    }
    const sortOrder = entry.sort_order;
    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder)) {
      throw new Error(`fixtures[${index}].sort_order must be a whole number, got ${JSON.stringify(sortOrder)}.`);
    }
    const bestOf = entry.best_of;
    if (!(BEST_OF as readonly unknown[]).includes(bestOf)) {
      throw new Error(`fixtures[${index}].best_of must be 1, 3 or 5, got ${JSON.stringify(bestOf)}.`);
    }
    for (const side of ["team_a", "team_b"] as const) {
      const name = entry[side];
      if (name !== null && name !== undefined && typeof name !== "string") {
        throw new Error(`fixtures[${index}].${side} must be a team name or null, got ${JSON.stringify(name)}.`);
      }
    }
    const scheduledAt = entry.scheduled_at;
    if (scheduledAt !== null && scheduledAt !== undefined && typeof scheduledAt !== "string") {
      throw new Error(`fixtures[${index}].scheduled_at must be an ISO timestamp or null.`);
    }
    if (typeof scheduledAt === "string" && Number.isNaN(Date.parse(scheduledAt))) {
      throw new Error(`fixtures[${index}].scheduled_at is not a date Postgres will take: ${JSON.stringify(scheduledAt)}.`);
    }
    return {
      stage: stage as FixtureStage,
      sort_order: sortOrder,
      team_a: (entry.team_a as string | null | undefined) ?? null,
      team_b: (entry.team_b as string | null | undefined) ?? null,
      best_of: bestOf as BestOf,
      scheduled_at: (scheduledAt as string | null | undefined) ?? null,
    } satisfies BracketFixture;
  });

  return {
    league,
    season: typeof raw.season === "string" ? raw.season : null,
    note: typeof raw.note === "string" ? raw.note : null,
    fixtures,
  };
}
