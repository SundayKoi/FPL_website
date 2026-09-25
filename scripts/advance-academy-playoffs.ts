/**
 * Fill Academy playoff TBD slots from completed series after stats ingestion.
 * The bracket file declares each winner's destination; rerunning this script
 * is safe. Dry-run is the default, and `--apply` opts into fixture updates.
 */
import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";
import {
  parseBracketFile,
} from "../src/lib/schedule/bracketSeed";
import {
  planPlayoffAdvancement,
  type PlayoffFixtureResult,
} from "../src/lib/schedule/playoffAdvancement";

const BRACKET_PATH = "scripts/data/brackets/academy-2026-playoffs.json";
const TARGET_SUPABASE_URL = "https://tyywoneobreracfnujdk.supabase.co";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set.`);
  return value;
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const dryRun = args.includes("--dry-run");
  const unknown = args.filter((arg) => arg.startsWith("-") && arg !== "--apply" && arg !== "--dry-run");
  if (unknown.length) throw new Error(`Unknown option(s): ${unknown.join(", ")}. Use --dry-run or --apply.`);
  if (apply && dryRun) throw new Error("Choose either --dry-run or --apply, not both.");

  const url = requireEnv("SUPABASE_URL");
  if (new URL(url).origin !== TARGET_SUPABASE_URL) {
    throw new Error(`SUPABASE_URL must target the configured FPL cloud project (${TARGET_SUPABASE_URL}).`);
  }
  const supabase = createClient(url, requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });

  const bracket = parseBracketFile(JSON.parse(readFileSync(BRACKET_PATH, "utf8")));
  if (bracket.league !== "academy") throw new Error(`${BRACKET_PATH} must describe the Academy bracket.`);

  const { data: settings, error: settingsError } = await supabase
    .from("league_settings")
    .select("academy_season")
    .eq("id", 1)
    .maybeSingle();
  if (settingsError) throw new Error(`Could not read the Academy season: ${settingsError.message}`);
  const season = bracket.season ?? (settings as { academy_season: string | null } | null)?.academy_season;
  if (!season) throw new Error("league_settings has no academy_season, and the bracket file names no season.");

  const { data: rows, error: fixturesError } = await supabase
    .from("fixtures")
    .select("id, season, stage, sort_order, team_a, team_b, best_of, scheduled_at, score_a, score_b")
    .eq("season", season)
    .in("stage", ["quarterfinals", "semifinals", "finals"]);
  if (fixturesError) throw new Error(`Could not read Academy playoff fixtures for ${season}: ${fixturesError.message}`);

  const configured = new Map(bracket.fixtures.map((fixture) => [`${fixture.stage}#${fixture.sort_order}`, fixture]));
  const fixtureRows = (rows ?? []) as Omit<PlayoffFixtureResult, "winner_to" | "resultEvidence">[];
  const sourceIds = fixtureRows
    .filter((row) => configured.get(`${row.stage}#${row.sort_order}`)?.winner_to)
    .map((row) => row.id);
  const latestReportByFixture = new Map<string, { status: string; warning_text: string | null }>();
  if (sourceIds.length > 0) {
    const { data: reportRows, error: reportsError } = await supabase
      .from("match_reports")
      .select("fixture_id, status, warning_text, submitted_at")
      .in("fixture_id", sourceIds)
      .order("submitted_at", { ascending: false });
    if (reportsError) throw new Error(`Could not read Academy playoff ingest evidence: ${reportsError.message}`);
    for (const report of (reportRows ?? []) as {
      fixture_id: string | null;
      status: string;
      warning_text: string | null;
      submitted_at: string;
    }[]) {
      if (report.fixture_id && !latestReportByFixture.has(report.fixture_id)) {
        latestReportByFixture.set(report.fixture_id, { status: report.status, warning_text: report.warning_text });
      }
    }
  }

  const existing = fixtureRows.map((row) => {
    const latestReport = latestReportByFixture.get(row.id);
    const terminal = latestReport?.status === "ingested" || latestReport?.status === "forfeit";
    const resultEvidence: PlayoffFixtureResult["resultEvidence"] = !latestReport
      ? "pending"
      : terminal && !latestReport.warning_text
        ? "verified"
        : terminal
          ? "conflict"
          : "pending";
    return {
      ...row,
      winner_to: configured.get(`${row.stage}#${row.sort_order}`)?.winner_to,
      resultEvidence,
    };
  });
  const plan = planPlayoffAdvancement(existing, bracket.fixtures);

  console.log(`Academy ${season} playoff advancement from ${BRACKET_PATH}:`);
  for (const update of plan.updates) {
    console.log(`  [${apply ? "update" : "would update"}] ${update.stage} #${update.sort_order} ${update.destination.side} = ${update.winner}`);
  }
  for (const update of plan.alreadySet) {
    console.log(`  [already set] ${update.stage} #${update.sort_order} ${update.destination.side} = ${update.winner}`);
  }
  for (const pending of plan.pending) console.log(`  [pending] ${pending}`);
  for (const conflict of plan.conflicts) console.error(`  [conflict] ${conflict}`);
  if (plan.conflicts.length) throw new Error(`${plan.conflicts.length} bracket conflict(s); no fixture slots were changed.`);

  if (!apply) {
    console.log(`Dry run — ${plan.updates.length} fixture slot(s) would be filled. Nothing was written.`);
    return;
  }

  for (const update of plan.updates) {
    const { data, error } = await supabase
      .from("fixtures")
      .update({ [update.destination.side]: update.winner })
      .eq("id", update.id)
      .eq("season", season)
      .is("score_a", null)
      .is("score_b", null)
      .is(update.destination.side, null)
      .select("id");
    if (error) throw new Error(`Could not fill ${update.stage} #${update.sort_order}: ${error.message}`);
    if (!data?.length) {
      throw new Error(`${update.stage} #${update.sort_order} changed after planning; no slot was overwritten. Re-run to refresh the plan.`);
    }
  }

  console.log(`Done — filled ${plan.updates.length} Academy playoff fixture slot(s) in season ${season}.`);
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
