/** Seed a reviewed playoff file. Runs in dry-run mode unless --write is explicit. */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  parseBracketFile,
  planBracketSeed,
  type BracketSeedRow,
  type ExistingFixture,
} from "../src/lib/schedule/bracketSeed";
import { normalizePlayoffTeamName } from "../src/lib/schedule/playoffs";

const DEFAULT_BRACKET = "scripts/data/brackets/academy-2026-playoffs.json";
const PROTECTED_TABLES = [
  "match_reports",
  "match_codes",
  "match_drafts",
  "match_draft_settings",
  "betting_markets",
  "homepage_featured_settings",
] as const;

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

function describe(row: BracketSeedRow): string {
  return `${row.stage} #${row.sort_order} — ${row.team_a ?? "TBD"} vs ${row.team_b ?? "TBD"} (Bo${row.best_of}, ${row.scheduled_at ?? "date TBD"})`;
}

function errorText(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const write = args.includes("--write");
  const unknown = args.filter((arg) => arg.startsWith("-") && !["--write", "--dry-run", "--local"].includes(arg));
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(", ")}. Use --write to apply; otherwise this is a dry run.`);
  if (write && args.includes("--dry-run")) throw new Error("Choose either --write or --dry-run, not both.");
  const bracketPath = (args.find((arg) => !arg.startsWith("-")) || process.env.BRACKET_FILE || DEFAULT_BRACKET).trim();
  const bracket = parseBracketFile(JSON.parse(readFileSync(bracketPath, "utf8")));
  if (write && bracket.league === "premier" && !bracket.publishingApproved) {
    throw new Error("Premier S5 dates are provisional. Confirm them in the bracket file before using --write.");
  }
  const supabaseUrl = requireEnv("SUPABASE_URL");
  const url = new URL(supabaseUrl);
  const localMode = args.includes("--local");
  if (localMode ? !["localhost", "127.0.0.1"].includes(url.hostname) : url.hostname !== "tyywoneobreracfnujdk.supabase.co") {
    throw new Error(localMode
      ? "--local requires a localhost Supabase URL."
      : "Cloud bracket operations must use https://tyywoneobreracfnujdk.supabase.co; use --local only for explicit local development.");
  }
  const supabase = createClient(supabaseUrl, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const { data: settings, error: settingsError } = await supabase
    .from("league_settings")
    .select("current_season, academy_season, featured_draft_id, academy_draft_id")
    .eq("id", 1)
    .single();
  if (settingsError) throw new Error(`Could not read league settings: ${settingsError.message}`);
  const selectedSeason = bracket.league === "premier" ? settings.current_season : settings.academy_season;
  const selectedDraftId = bracket.league === "premier" ? settings.featured_draft_id : settings.academy_draft_id;
  if (!selectedSeason || !selectedDraftId) throw new Error(`No selected ${bracket.league} draft and season are configured.`);
  if (bracket.season && bracket.season !== selectedSeason) {
    throw new Error(`Bracket season ${bracket.season} does not match the selected ${bracket.league} season ${selectedSeason}.`);
  }
  const season = selectedSeason;

  const [draftResult, membershipResult, fixtureResult] = await Promise.all([
    supabase.from("teams").select("name").eq("draft_id", selectedDraftId),
    supabase.from("roster_memberships").select("league_team_id").eq("season", season),
    supabase.from("fixtures").select("id, season, stage, sort_order, team_a, team_b, score_a, score_b, division, best_of, scheduled_at").eq("season", season),
  ]);
  for (const [label, result] of [["selected draft teams", draftResult], ["season memberships", membershipResult], ["fixtures", fixtureResult]] as const) {
    if (result.error) throw new Error(`Could not read ${label}: ${result.error.message}`);
  }
  const memberships = (membershipResult.data ?? []) as { league_team_id: string }[];
  const seasonTeamIds = [...new Set(memberships.map((row) => row.league_team_id))];
  if (seasonTeamIds.length === 0) throw new Error(`No roster memberships exist for ${season}.`);
  const { data: canonicalRows, error: canonicalError } = await supabase
    .from("league_teams")
    .select("id, name")
    .in("id", seasonTeamIds);
  if (canonicalError) throw new Error(`Could not read season team names: ${canonicalError.message}`);
  const canonical = (canonicalRows ?? []) as { id: string; name: string }[];

  const existing = ((fixtureResult.data ?? []) as ExistingFixture[]).map((row) => ({ ...row, protectedReasons: [] as string[] }));
  const playoffIds = existing.filter((row) => ["quarterfinals", "semifinals", "finals"].includes(row.stage)).map((row) => row.id);
  if (playoffIds.length) {
    for (const table of PROTECTED_TABLES) {
      const { data, error } = await supabase.from(table).select("fixture_id").in("fixture_id", playoffIds);
      if (error) throw new Error(`Could not check ${table} dependencies: ${error.message}`);
      const protectedIds = new Set(((data ?? []) as { fixture_id: string | null }[]).map((row) => row.fixture_id).filter((id): id is string => Boolean(id)));
      for (const row of existing) if (protectedIds.has(row.id)) row.protectedReasons!.push(table);
    }
  }

  const canonicalSeasonNames = canonical.map((row) => row.name);
  const entrantNames = new Set(bracket.entrants.map((entrant) => normalizePlayoffTeamName(entrant.name)));
  const canonicalEntrants = canonical.filter((row) => entrantNames.has(normalizePlayoffTeamName(row.name)));
  const plan = planBracketSeed(
    existing,
    bracket.fixtures,
    season,
    ((draftResult.data ?? []) as { name: string }[]).map((row) => row.name),
    canonicalSeasonNames,
    bracket.entrants,
  );

  console.log(`${bracketPath}: ${bracket.fixtures.length} fixture(s) for ${bracket.league} ${season}.`);
  if (bracket.note) console.log(`Note: ${bracket.note}`);
  if (plan.errors.length) {
    for (const error of plan.errors) console.error(`[ERROR] ${error}`);
    throw new Error(`${plan.errors.length} validation problem(s); no rows were written.`);
  }
  for (const row of plan.inserts) console.log(`  [insert] ${describe(row)}`);
  for (const { row } of plan.updates) console.log(`  [update] ${describe(row)}`);
  for (const row of plan.unchanged) console.log(`  [same]   ${row.stage} #${row.sort_order} — ${row.id}`);
  for (const skip of plan.skips) {
    console.log(`  [skip]   ${skip.stage} #${skip.sort_order} — already played (${skip.played}); left untouched.`);
  }
  if (!write) {
    console.log(`Dry run — would insert ${plan.inserts.length}, update ${plan.updates.length}, preserve ${plan.unchanged.length}, skip ${plan.skips.length} played fixture(s). Nothing was written.`);
    return;
  }

  if (bracket.league === "premier") {
    const entrants = bracket.entrants.map((entrant) => {
      const matches = canonicalEntrants.filter((team) => normalizePlayoffTeamName(team.name) === normalizePlayoffTeamName(entrant.name));
      if (matches.length !== 1) throw new Error(`Frozen entrant ${entrant.name} is not unique in ${season}.`);
      return entrant;
    });
    const { data, error } = await supabase.rpc("initialize_premier_playoffs", {
      p_season: season,
      p_draft_id: selectedDraftId,
      p_entrants: entrants,
      p_fixtures: bracket.fixtures,
      p_policy: bracket.pairingPolicy,
    });
    if (error) throw new Error(`Premier bracket seed failed: ${error.message}`);
    console.log(`Premier bracket initialized atomically: ${JSON.stringify(data)}`);
    return;
  }

  // Academy's existing bye bracket is kept on its original, file-driven path.
  // The reviewed plan above ensures each slot has one identity and no fixture
  // with dependent work is rewritten.
  const { error: insertError } = plan.inserts.length
    ? await supabase.from("fixtures").insert(plan.inserts)
    : { error: null };
  if (insertError) throw new Error(`Could not insert Academy fixtures: ${insertError.message}`);
  for (const { id, row } of plan.updates) {
    const { error } = await supabase.from("fixtures").update({
      team_a: row.team_a,
      team_b: row.team_b,
      division: row.division,
      best_of: row.best_of,
      scheduled_at: row.scheduled_at,
    }).eq("id", id);
    if (error) throw new Error(`Could not update ${row.stage} #${row.sort_order}: ${error.message}`);
  }
  console.log(`Academy bracket seeded: inserted ${plan.inserts.length}, updated ${plan.updates.length}, preserved ${plan.unchanged.length}, skipped ${plan.skips.length} played fixture(s).`);
}

main().catch((error) => {
  console.error(errorText(error));
  process.exit(1);
});
