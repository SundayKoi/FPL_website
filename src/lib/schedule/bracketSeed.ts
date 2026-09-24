import { FIXTURE_STAGES, type Division, type FixtureStage } from "./types";
import { normalizePlayoffTeamName, type PlayoffPolicy22, type PlayoffPolicy40 } from "./playoffs";

const BEST_OF = [1, 3, 5] as const;
export type BestOf = (typeof BEST_OF)[number];

export interface BracketFixture {
  stage: FixtureStage;
  sort_order: number;
  team_a: string | null;
  team_b: string | null;
  best_of: BestOf;
  scheduled_at: string | null;
  /** Explicit next-round slot for this fixture's winner. */
  winner_to?: WinnerDestination | null;
}

export interface WinnerDestination {
  stage: FixtureStage;
  sort_order: number;
  side: "team_a" | "team_b";
}

export interface BracketEntrantSeed {
  name: string;
  division: Division;
  seed: number;
}

export interface BracketFile {
  league: "premier" | "academy";
  season: string | null;
  note: string | null;
  publishingApproved: boolean;
  entrants: BracketEntrantSeed[];
  pairingPolicy: { pairing_22: PlayoffPolicy22 | null; pairing_40: PlayoffPolicy40 | null };
  fixtures: BracketFixture[];
}

export interface BracketSeedRow extends BracketFixture {
  season: string;
  division: null | Division;
}

export interface ExistingFixture {
  id: string;
  season: string;
  stage: FixtureStage;
  sort_order: number;
  team_a: string | null;
  team_b: string | null;
  score_a: number | null;
  score_b: number | null;
  division?: Division | null;
  best_of?: BestOf;
  scheduled_at?: string | null;
  protectedReasons?: string[];
}

export interface BracketSeedPlan {
  inserts: BracketSeedRow[];
  updates: { id: string; row: BracketSeedRow }[];
  skips: { id: string; stage: FixtureStage; sort_order: number; played: string }[];
  unchanged: { id: string; stage: FixtureStage; sort_order: number }[];
  errors: string[];
}

const slotKey = (stage: FixtureStage, sortOrder: number) => `${stage}#${sortOrder}`;

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function parseEntrants(raw: unknown): BracketEntrantSeed[] {
  if (raw === undefined) return [];
  if (!Array.isArray(raw)) throw new Error('"entrants" must be an array.');
  const entrants = raw.map((value, index) => {
    if (!isRecord(value)) throw new Error(`entrants[${index}] must be an object.`);
    const { name, division, seed } = value;
    if (typeof name !== "string" || !name.trim()) throw new Error(`entrants[${index}].name must be a non-empty team name.`);
    if (division !== "Solari" && division !== "Lunari") throw new Error(`entrants[${index}].division must be Solari or Lunari.`);
    if (typeof seed !== "number" || !Number.isInteger(seed) || seed < 1 || seed > 4) throw new Error(`entrants[${index}].seed must be an integer from 1 to 4.`);
    return { name: name.trim(), division, seed } satisfies BracketEntrantSeed;
  });
  const names = new Set<string>();
  const seeds = new Set<string>();
  for (const entrant of entrants) {
    const normalized = normalizePlayoffTeamName(entrant.name);
    const seedKey = `${entrant.division}:${entrant.seed}`;
    if (names.has(normalized)) throw new Error(`The entrant name "${entrant.name}" appears more than once.`);
    if (seeds.has(seedKey)) throw new Error(`The entrant seed ${seedKey} appears more than once.`);
    names.add(normalized);
    seeds.add(seedKey);
  }
  if (entrants.length > 0 && (entrants.length !== 8 || seeds.size !== 8)) {
    throw new Error("A frozen Premier seed list must contain eight teams, with seeds 1–4 in each division.");
  }
  return entrants;
}

/** Parse a committed bracket file and reject malformed slots before any read or write. */
export function parseBracketFile(raw: unknown): BracketFile {
  if (!isRecord(raw)) throw new Error("A bracket file must be a JSON object.");
  if (raw.league !== "premier" && raw.league !== "academy") throw new Error('"league" must be "premier" or "academy".');
  if (raw.season !== undefined && raw.season !== null && typeof raw.season !== "string") throw new Error('"season" must be a string when given.');
  if (raw.publishing_approved !== undefined && typeof raw.publishing_approved !== "boolean") {
    throw new Error('"publishing_approved" must be true or false when given.');
  }
  if (!Array.isArray(raw.fixtures) || raw.fixtures.length === 0) throw new Error('"fixtures" must be a non-empty array.');

  const fixtures = raw.fixtures.map((value, index) => {
    if (!isRecord(value)) throw new Error(`fixtures[${index}] must be an object.`);
    const { stage, sort_order: sortOrder, best_of: bestOf } = value;
    if (typeof stage !== "string" || !(FIXTURE_STAGES as readonly string[]).includes(stage)) {
      throw new Error(`fixtures[${index}].stage must be one of ${FIXTURE_STAGES.join(", ")}.`);
    }
    if (typeof sortOrder !== "number" || !Number.isInteger(sortOrder) || sortOrder < 0) {
      throw new Error(`fixtures[${index}].sort_order must be a non-negative whole number.`);
    }
    if (!(BEST_OF as readonly unknown[]).includes(bestOf)) throw new Error(`fixtures[${index}].best_of must be 1, 3 or 5.`);
    for (const side of ["team_a", "team_b"] as const) {
      const name = value[side];
      if (name !== null && name !== undefined && (typeof name !== "string" || !name.trim())) {
        throw new Error(`fixtures[${index}].${side} must be a non-empty name or null.`);
      }
    }
    const kickoff = value.scheduled_at;
    if (kickoff !== null && kickoff !== undefined && typeof kickoff !== "string") throw new Error(`fixtures[${index}].scheduled_at must be an ISO timestamp or null.`);
    if (typeof kickoff === "string" && Number.isNaN(Date.parse(kickoff))) {
      throw new Error(`fixtures[${index}].scheduled_at is not a date Postgres will take: ${JSON.stringify(kickoff)}.`);
    }
    const teamA = (value.team_a as string | null | undefined)?.trim() || null;
    const teamB = (value.team_b as string | null | undefined)?.trim() || null;
    if (teamA && teamB && normalizePlayoffTeamName(teamA) === normalizePlayoffTeamName(teamB)) {
      throw new Error(`fixtures[${index}] names the same team on both sides.`);
    }
    let winnerTo: WinnerDestination | null = null;
    if (value.winner_to !== undefined && value.winner_to !== null) {
      if (!isRecord(value.winner_to)) {
        throw new Error(`fixtures[${index}].winner_to must be an object or null.`);
      }
      const targetStage = value.winner_to.stage;
      if (typeof targetStage !== "string" || !(FIXTURE_STAGES as readonly string[]).includes(targetStage)) {
        throw new Error(`fixtures[${index}].winner_to.stage must be one of ${FIXTURE_STAGES.join(", ")}.`);
      }
      const targetOrder = value.winner_to.sort_order;
      if (typeof targetOrder !== "number" || !Number.isInteger(targetOrder) || targetOrder < 0) {
        throw new Error(`fixtures[${index}].winner_to.sort_order must be a non-negative whole number.`);
      }
      const side = value.winner_to.side;
      if (side !== "team_a" && side !== "team_b") {
        throw new Error(`fixtures[${index}].winner_to.side must be \"team_a\" or \"team_b\".`);
      }
      winnerTo = { stage: targetStage as FixtureStage, sort_order: targetOrder, side };
    }
    return {
      stage: stage as FixtureStage,
      sort_order: sortOrder,
      team_a: teamA,
      team_b: teamB,
      best_of: bestOf as BestOf,
      scheduled_at: (kickoff as string | null | undefined) ?? null,
      ...(winnerTo ? { winner_to: winnerTo } : {}),
    } satisfies BracketFixture;
  });
  const seen = new Set<string>();
  for (const fixture of fixtures) {
    const key = slotKey(fixture.stage, fixture.sort_order);
    if (seen.has(key)) throw new Error(`The bracket lists ${key} more than once.`);
    seen.add(key);
  }

  const stageOrder = new Map(FIXTURE_STAGES.map((stage, index) => [stage, index]));
  const bySlot = new Map(fixtures.map((fixture) => [slotKey(fixture.stage, fixture.sort_order), fixture]));
  const destinations = new Set<string>();
  for (const fixture of fixtures) {
    const destination = fixture.winner_to;
    if (!destination) continue;
    if ((stageOrder.get(destination.stage) ?? -1) <= (stageOrder.get(fixture.stage) ?? -1)) {
      throw new Error(`${fixture.stage} #${fixture.sort_order} must advance to a later stage.`);
    }
    const target = bySlot.get(slotKey(destination.stage, destination.sort_order));
    if (!target) {
      throw new Error(`${fixture.stage} #${fixture.sort_order} advances to a fixture the bracket does not define.`);
    }
    if (target[destination.side] !== null) {
      throw new Error(`${fixture.stage} #${fixture.sort_order} advances into ${destination.stage} #${destination.sort_order} ${destination.side}, which is already seeded.`);
    }
    const destinationKey = `${slotKey(destination.stage, destination.sort_order)}#${destination.side}`;
    if (destinations.has(destinationKey)) {
      throw new Error(`${destination.stage} #${destination.sort_order} ${destination.side} has more than one feeder fixture.`);
    }
    destinations.add(destinationKey);
  }

  const entrants = parseEntrants(raw.entrants);
  const policyRaw = isRecord(raw.pairing_policy) ? raw.pairing_policy : {};
  const pairing22 = policyRaw.pairing_22 ?? null;
  const pairing40 = policyRaw.pairing_40 ?? null;
  if (pairing22 !== null && pairing22 !== "solari_high_vs_lunari_low" && pairing22 !== "solari_high_vs_lunari_high") {
    throw new Error('pairing_policy.pairing_22 is not a supported value.');
  }
  if (pairing40 !== null && pairing40 !== "outer_seeds" && pairing40 !== "adjacent_seeds") {
    throw new Error('pairing_policy.pairing_40 is not a supported value.');
  }
  if (raw.league === "premier") {
    if (entrants.length !== 8) throw new Error("Premier playoff files need the eight frozen entrants.");
    if (fixtures.length !== 7) throw new Error("Premier playoff files need exactly seven fixture slots.");
    const expectedCounts = { quarterfinals: 4, semifinals: 2, finals: 1 } as const;
    for (const [stage, count] of Object.entries(expectedCounts)) {
      const rows = fixtures.filter((fixture) => fixture.stage === stage).sort((a, b) => a.sort_order - b.sort_order);
      if (rows.length !== count || rows.some((fixture, index) => fixture.sort_order !== index)) {
        throw new Error(`Premier ${stage} must contain slots 0 through ${count - 1}.`);
      }
      if (rows.some((fixture) => fixture.best_of !== 5)) throw new Error(`Premier ${stage} fixtures must all be best-of-five.`);
      if (stage === "quarterfinals" && rows.some((fixture) => !fixture.team_a || !fixture.team_b)) {
        throw new Error("Premier quarterfinals must have both teams assigned.");
      }
      if (stage !== "quarterfinals" && rows.some((fixture) => fixture.team_a || fixture.team_b)) {
        throw new Error(`Premier ${stage} slots must stay TBD until atomic advancement publishes them.`);
      }
    }
    const frozenNames = new Set(entrants.map((entrant) => normalizePlayoffTeamName(entrant.name)));
    const quarterfinalNames = fixtures
      .filter((fixture) => fixture.stage === "quarterfinals")
      .flatMap((fixture) => [fixture.team_a, fixture.team_b])
      .map((name) => normalizePlayoffTeamName(name));
    if (quarterfinalNames.some((name) => !frozenNames.has(name))
      || new Set(quarterfinalNames).size !== 8
      || quarterfinalNames.length !== 8) {
      throw new Error("Premier quarterfinals must use each frozen entrant exactly once.");
    }
  }

  return {
    league: raw.league,
    season: typeof raw.season === "string" ? raw.season : null,
    note: typeof raw.note === "string" ? raw.note : null,
    publishingApproved: raw.publishing_approved === true,
    entrants,
    pairingPolicy: { pairing_22: pairing22 as PlayoffPolicy22 | null, pairing_40: pairing40 as PlayoffPolicy40 | null },
    fixtures,
  };
}

function canonicalNames(teamNames: string[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const name of teamNames) {
    const normalized = normalizePlayoffTeamName(name);
    if (!normalized) continue;
    map.set(normalized, [...(map.get(normalized) ?? []), name.trim()]);
  }
  return map;
}

function rowsEqual(a: BracketSeedRow, b: ExistingFixture): boolean {
  return a.team_a === b.team_a
    && a.team_b === b.team_b
    && a.division === (b.division ?? null)
    && a.best_of === b.best_of
    && a.scheduled_at === (b.scheduled_at ?? null);
}

/** Validate selected-draft names and plan a stable, non-destructive seed. */
export function planBracketSeed(
  existing: ExistingFixture[],
  fixtures: BracketFixture[],
  season: string,
  selectedDraftTeamNames: string[],
  canonicalSeasonTeamNames: string[],
  entrants: BracketEntrantSeed[] = [],
): BracketSeedPlan {
  const plan: BracketSeedPlan = { inserts: [], updates: [], skips: [], unchanged: [], errors: [] };
  const selected = canonicalNames(selectedDraftTeamNames);
  const canonical = canonicalNames(canonicalSeasonTeamNames);
  const expectedSeason = new Set(entrants.map((entrant) => normalizePlayoffTeamName(entrant.name)));
  const counts = new Map<string, ExistingFixture[]>();
  for (const row of existing) {
    if (!["quarterfinals", "semifinals", "finals"].includes(row.stage)) continue;
    const key = slotKey(row.stage, row.sort_order);
    counts.set(key, [...(counts.get(key) ?? []), row]);
  }
  for (const [key, rows] of counts) {
    if (rows.length > 1) plan.errors.push(`${key}: existing schedule has ${rows.length} rows for one playoff slot.`);
  }
  for (const entrant of entrants) {
    const normalized = normalizePlayoffTeamName(entrant.name);
    const selectedMatches = selected.get(normalized) ?? [];
    const canonicalMatches = canonical.get(normalized) ?? [];
    if (selectedMatches.length !== 1) plan.errors.push(`Frozen entrant "${entrant.name}" resolves to ${selectedMatches.length} teams in the selected draft.`);
    if (canonicalMatches.length !== 1) plan.errors.push(`Frozen entrant "${entrant.name}" resolves to ${canonicalMatches.length} canonical teams in the season.`);
  }

  const seen = new Set<string>();
  for (const fixture of fixtures) {
    const label = `${fixture.stage} #${fixture.sort_order}`;
    const key = slotKey(fixture.stage, fixture.sort_order);
    if (seen.has(key)) {
      plan.errors.push(`${label}: the bracket lists this slot twice — (season, stage, sort_order) has to be unique.`);
      continue;
    }
    seen.add(key);
    if ((counts.get(key)?.length ?? 0) > 1) continue;
    const current = counts.get(key)?.[0];
    const resolved: (string | null)[] = [];
    let valid = true;
    for (const [side, name] of [["team_a", fixture.team_a], ["team_b", fixture.team_b]] as const) {
      if (!name) {
        resolved.push(null);
        continue;
      }
      const normalized = normalizePlayoffTeamName(name);
      const selectedMatches = selected.get(normalized) ?? [];
      const canonicalMatches = canonical.get(normalized) ?? [];
      if (selectedMatches.length !== 1) {
        plan.errors.push(selectedMatches.length === 0
          ? `${label}: no league_teams row is called "${name}" (${side}).`
          : `${label}: "${name}" resolves to ${selectedMatches.length} teams in the selected draft.`);
        valid = false;
        continue;
      }
      if (canonicalMatches.length !== 1) {
        plan.errors.push(`${label}: "${name}" resolves to ${canonicalMatches.length} canonical teams for the season.`);
        valid = false;
        continue;
      }
      if (entrants.length && !expectedSeason.has(normalized)) {
        plan.errors.push(`${label}: "${name}" is not a frozen Premier playoff entrant.`);
        valid = false;
        continue;
      }
      resolved.push(canonicalMatches[0]);
    }
    if (!valid) continue;
    let teamA = resolved[0] ?? null;
    let teamB = resolved[1] ?? null;
    if (teamA && teamB && normalizePlayoffTeamName(teamA) === normalizePlayoffTeamName(teamB)) {
      plan.errors.push(`${label}: the same team cannot be assigned to both sides.`);
      continue;
    }
    if (current && (fixture.stage === "semifinals" || fixture.stage === "finals")) {
      // Re-running the seed file must leave advancement results intact.
      teamA ??= current.team_a;
      teamB ??= current.team_b;
    }
    const row: BracketSeedRow = {
      ...fixture,
      season,
      division: null,
      team_a: teamA,
      team_b: teamB,
    };
    if (!current) {
      plan.inserts.push(row);
    } else if (rowsEqual(row, current)) {
      plan.unchanged.push({ id: current.id, stage: current.stage, sort_order: current.sort_order });
    } else if (entrants.length === 0
      && (current.score_a !== null || current.score_b !== null)
      && (current.protectedReasons?.length ?? 0) === 0) {
      // Preserve the Academy seeder's established behavior: leave played
      // rows untouched and report them, while Premier initialization fails
      // closed through its authorized atomic RPC.
      plan.skips.push({
        id: current.id,
        stage: current.stage,
        sort_order: current.sort_order,
        played: `${current.team_a ?? "TBD"} ${current.score_a ?? "?"}–${current.score_b ?? "?"} ${current.team_b ?? "TBD"}`,
      });
    } else if (current.score_a !== null || current.score_b !== null || (current.protectedReasons?.length ?? 0) > 0) {
      const reason = current.score_a !== null || current.score_b !== null
        ? "it already has a score"
        : `it has dependent work (${current.protectedReasons?.join(", ")})`;
      plan.errors.push(`${label}: fixture ${current.id} is protected because ${reason}.`);
    } else {
      plan.updates.push({ id: current.id, row });
    }
  }
  return plan;
}
