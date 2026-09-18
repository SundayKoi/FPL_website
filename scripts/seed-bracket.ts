/**
 * Puts a playoff bracket on the schedule, from a file in this repo.
 *
 * The bracket is decided in a spreadsheet somewhere and then has to become
 * rows in `public.fixtures`, because that table is what the schedule page
 * renders, what the betting generator reads for Monday's markets, and what
 * the Send-off reads to work out whose split ended in which week
 * (src/lib/cards/sendoff.ts). Nobody who runs the league can run SQL, and
 * typing eight playoff rows into the fixtures editor by hand is exactly the
 * sort of job that ends in one misspelt team nobody notices until a whole
 * roster fails to print.
 *
 * So the bracket is a reviewed file — scripts/data/brackets/*.json — and this
 * script is the only thing that writes it. The file is the source of truth:
 * fix a kickoff there, run this again, and the schedule matches. It is not
 * Academy-specific; the Premier bracket is another file.
 *
 * What it guarantees:
 *
 * - **Team names are checked before anything is written.** Every non-null
 *   name must match a `league_teams.name` (compared with normalizeTeamName,
 *   written back in the league's own spelling). One bad name fails the run
 *   with every bad name listed, because a fixture spelt "Astronaut" is a
 *   fixture the send-off matches nobody to.
 * - **It is idempotent, keyed by `(season, stage, sort_order)`.** A missing
 *   row is inserted, an existing unscored row is rewritten in place, and a
 *   row that already has a score is left completely alone — re-seeding a
 *   played series would rewrite the result the eliminations are read from.
 * - **It never deletes.** A fixture the file stopped mentioning stays.
 *
 * `null` teams are on purpose: a quarterfinal bye's semifinal has a TBD
 * opponent, and the final has two. Both render as TBD and are skipped by
 * `eliminationsInWeek`, so seeding the whole bracket up front is safe, and
 * the names get filled in later — here, by editing the file, or on the
 * schedule page.
 *
 * Run: npx tsx scripts/seed-bracket.ts [path/to/bracket.json] [--dry-run]
 * The path defaults to the Academy playoff bracket. `--dry-run` prints
 * exactly what would be written and exits without writing — do that first;
 * it is also what .github/workflows/seed-bracket.yml does unless someone
 * unticks the box.
 *
 * The season comes from `league_settings` (the file's `league` picks
 * `academy_season` or `current_season`) unless the file names a `season`
 * outright, which wins. Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import { fetchCardSeason } from "../src/lib/cards/queries";
import {
  parseBracketFile,
  planBracketSeed,
  type BracketSeedRow,
  type ExistingFixture,
} from "../src/lib/schedule/bracketSeed";

const DEFAULT_BRACKET = "scripts/data/brackets/academy-2026-playoffs.json";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** A plan line: the slot, the teams as they will be written, and the terms. */
function describe(row: BracketSeedRow): string {
  const kickoff = row.scheduled_at ?? "no kickoff yet";
  return `${row.stage} #${row.sort_order} — ${row.team_a ?? "TBD"} vs ${row.team_b ?? "TBD"} (Bo${row.best_of}, ${kickoff})`;
}

async function main(): Promise<void> {
  // argv first, then the workflow input — an empty string from a
  // workflow_dispatch with the field left blank arrives as an empty argument
  // and must fall through to the default rather than being read as a path.
  const args = process.argv.slice(2);
  const dryRun = args.includes("--dry-run");
  const unknown = args.filter((arg) => arg.startsWith("-") && arg !== "--dry-run");
  if (unknown.length > 0) throw new Error(`Unknown option(s): ${unknown.join(", ")}. Only --dry-run is supported.`);
  const bracketPath = (args.find((arg) => !arg.startsWith("-")) || process.env.BRACKET_FILE || DEFAULT_BRACKET).trim();

  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const bracket = parseBracketFile(JSON.parse(readFileSync(bracketPath, "utf8")));
  // An explicit season in the file wins: a bracket for a season that is no
  // longer the current one still has to seed onto its own season.
  const season = bracket.season ?? (await fetchCardSeason(supabase, bracket.league));
  if (!season) {
    throw new Error(
      `league_settings has no ${bracket.league === "academy" ? "academy_season" : "current_season"}, and ${bracketPath} names no season.`,
    );
  }

  const { data: teamRows, error: teamsError } = await supabase.from("league_teams").select("name");
  if (teamsError) throw new Error(`Could not read league_teams: ${teamsError.message}`);
  const teamNames = ((teamRows ?? []) as { name: string | null }[]).map((row) => row.name ?? "").filter(Boolean);
  if (teamNames.length === 0) throw new Error("league_teams is empty — there is nothing to validate team names against.");

  const { data: fixtureRows, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id, stage, sort_order, team_a, team_b, score_a, score_b")
    .eq("season", season);
  if (fixturesError) throw new Error(`Could not read fixtures for season ${season}: ${fixturesError.message}`);
  const existing = (fixtureRows ?? []) as ExistingFixture[];

  const plan = planBracketSeed(existing, bracket.fixtures, season, teamNames);

  console.log(`${bracketPath}: ${bracket.fixtures.length} fixture(s) for the ${bracket.league} season ${season}.`);
  if (bracket.note) console.log(`Note: ${bracket.note}`);

  if (plan.errors.length > 0) {
    // Nothing has been written at this point, and nothing will be: a
    // half-seeded bracket is worse than none, and every one of these is a
    // one-word fix in the file.
    for (const error of plan.errors) console.error(`[ERROR] ${error}`);
    throw new Error(`${plan.errors.length} problem(s) in ${bracketPath} — nothing was written.`);
  }

  for (const row of plan.inserts) console.log(`  [insert] ${describe(row)}`);
  for (const { row } of plan.updates) console.log(`  [update] ${describe(row)}`);
  for (const skip of plan.skips) {
    console.log(`  [skip]   ${skip.stage} #${skip.sort_order} — already played (${skip.played}); left exactly as it is.`);
  }

  if (dryRun) {
    console.log(
      `Dry run — would insert ${plan.inserts.length}, update ${plan.updates.length}, leave ${plan.skips.length} played fixture(s) alone. Nothing was written.`,
    );
    return;
  }

  if (plan.inserts.length > 0) {
    const { error } = await supabase.from("fixtures").insert(plan.inserts);
    if (error) throw new Error(`Could not insert ${plan.inserts.length} fixture(s): ${error.message}`);
  }
  for (const { id, row } of plan.updates) {
    const { error } = await supabase
      .from("fixtures")
      .update({
        team_a: row.team_a,
        team_b: row.team_b,
        best_of: row.best_of,
        scheduled_at: row.scheduled_at,
        division: row.division,
      })
      .eq("id", id);
    if (error) throw new Error(`Could not update ${row.stage} #${row.sort_order}: ${error.message}`);
  }

  console.log(
    `Done — inserted ${plan.inserts.length}, updated ${plan.updates.length}, left ${plan.skips.length} played fixture(s) alone in season ${season}.`,
  );
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
