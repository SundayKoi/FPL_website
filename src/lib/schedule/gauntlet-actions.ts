"use server";

// Admin actions behind the schedule page's "Generate gauntlet" panel.
//
// Server actions rather than the client-write pattern the rest of the
// schedule strip uses, because the draw needs the SEEDS: the standings the
// gauntlet keys on are composed server-side (`fetchHomepageStandings` reads
// the featured draft, the season's fixtures and the series durations that
// settle tiebreaker 4), and that is not something a browser should be
// re-deriving. The writes themselves still go through the caller's own
// cookie-bound client, so `fixtures_admin_write` RLS is the real gate —
// `fetchStaffTier` here only decides what the panel is allowed to attempt.
//
// Premier only: the Academy has no gauntlet (`ACADEMY_EXCLUDED_STAGES` in
// src/lib/academy/filtering.ts), so every read here uses the premier
// featured draft.

import { revalidatePath } from "next/cache";
import { createServerSupabase } from "@/lib/supabase/server";
import { fetchStaffTier } from "@/lib/auth/staffTier";
import { fetchHomepageStandings } from "@/lib/home/standings";
import { normalizeTeamName } from "@/lib/league/context";
import {
  drawGauntlet,
  resolveRoundOneResult,
  seedRoundTwo,
  seedsFromStandings,
  type DivisionSeeds,
  type GauntletFixtureDraft,
  type RoundOneReport,
  type RoundOneResult,
} from "./gauntlet";
import type { FixtureRow } from "./types";

const GAUNTLET_STAGES = ["gauntlet_r1", "gauntlet_r2"] as const;

// Statuses whose score is worth reading. 'failed' is left out: it means the
// ingest could not verify the series, so its score is not evidence of
// anything. 'pending' is IN, deliberately — on gauntlet night that is the
// only record round 1 has, because Tuesday's ingest has not run yet.
const USABLE_REPORT_STATUSES = ["pending", "needs_sides", "ingested", "forfeit"] as const;

/** One round-1 series and where its result came from, for the panel. */
export interface RoundOneStatus {
  fixtureId: string;
  team_a: string | null;
  team_b: string | null;
  /** Aligned to the fixture's side order; null when there is no result yet. */
  result: RoundOneResult | null;
  source: "fixture" | "report" | null;
  /** Why there is no usable result, when the reason is worth showing. */
  note: string | null;
}

export interface GauntletPreview {
  seeds: DivisionSeeds;
  /** The full draw as it stands today — round 1 plus the round-2
   *  placeholders — with no kickoff attached, purely to show the admin what
   *  the button would write. */
  roundOne: GauntletFixtureDraft[];
  existing: { r1: FixtureRow[]; r2: FixtureRow[] };
  /** One entry per existing round-1 fixture, in schedule order. */
  roundOneResults: RoundOneStatus[];
  /** The two round-2 pairings, offered only once every existing round-1 row
   *  carries a result. Null whenever round 1 is unplayed or unwritten. */
  roundTwo: { team_a: string; team_b: string }[] | null;
}

type PreviewResult = { ok: true; preview: GauntletPreview } | { ok: false; error: string };
type WriteResult = { ok: true; count: number } | { ok: false; error: string };

const messageOf = (e: unknown) => (e instanceof Error ? e.message : String(e));

/** Admin-or-owner, read from the caller's own session. */
async function staffClient() {
  const supabase = await createServerSupabase();
  const { isAdmin, isOwner } = await fetchStaffTier(supabase);
  return { supabase, allowed: isAdmin || isOwner };
}

/** The season's seeds, or a message explaining why it has none yet. */
async function seedsForSeason(season: string): Promise<DivisionSeeds> {
  const { teams } = await fetchHomepageStandings(season);
  if (teams.length === 0) {
    throw new Error(`No teams are in the standings for ${season}.`);
  }
  // fetchHomepageStandings degrades to an unordered 0-0 roster when the
  // fixtures read fails, and an unplayed season has no order either — both
  // would seed the bracket off the draft's nomination order.
  if (teams.every((team) => team.wins === 0 && team.losses === 0)) {
    throw new Error(
      `No ${season} results are recorded yet, so the standings have no order to seed from.`,
    );
  }
  return seedsFromStandings(teams.map((team) => ({ name: team.name, division: team.division ?? null })));
}

async function fetchGauntletRows(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  season: string,
): Promise<FixtureRow[]> {
  const { data, error } = await supabase
    .from("fixtures")
    .select("*")
    .eq("season", season)
    .in("stage", GAUNTLET_STAGES)
    .order("stage")
    .order("sort_order");
  if (error) throw new Error(error.message);
  return (data as FixtureRow[]) ?? [];
}

/**
 * The newest usable captain's report per round-1 fixture, with both sides
 * resolved from `league_teams` ids to names.
 *
 * Read with the caller's own cookie-bound client: `match_reports` and
 * `league_teams` both carry a `using (true)` select policy and a select grant
 * to `anon`/`authenticated` (20260811100002_match_reports.sql,
 * 20260811100001_league_config.sql), so an admin can read them without a
 * service-role key ever coming near this path.
 */
async function fetchRoundOneReports(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  fixtureIds: string[],
): Promise<Map<string, RoundOneReport>> {
  const byFixture = new Map<string, RoundOneReport>();
  if (fixtureIds.length === 0) return byFixture;

  const { data, error } = await supabase
    .from("match_reports")
    .select("fixture_id, team_a_id, team_b_id, score_a, score_b, submitted_at")
    .in("fixture_id", fixtureIds)
    .in("status", USABLE_REPORT_STATUSES)
    .order("submitted_at", { ascending: false });
  if (error) throw new Error(error.message);

  const reports = (data ?? []) as {
    fixture_id: string;
    team_a_id: string;
    team_b_id: string;
    score_a: number;
    score_b: number;
  }[];
  if (reports.length === 0) return byFixture;

  const teamIds = Array.from(new Set(reports.flatMap((r) => [r.team_a_id, r.team_b_id])));
  const { data: teamRows, error: teamsError } = await supabase
    .from("league_teams")
    .select("id, name")
    .in("id", teamIds);
  if (teamsError) throw new Error(teamsError.message);
  const names = new Map(((teamRows ?? []) as { id: string; name: string }[]).map((t) => [t.id, t.name]));

  // Newest first from the query, so the first row per fixture wins.
  for (const report of reports) {
    if (byFixture.has(report.fixture_id)) continue;
    byFixture.set(report.fixture_id, {
      team_a: names.get(report.team_a_id) ?? null,
      team_b: names.get(report.team_b_id) ?? null,
      score_a: report.score_a,
      score_b: report.score_b,
    });
  }
  return byFixture;
}

/**
 * Where each round-1 series' result stands: the fixture's own score when it
 * has one, otherwise the captains' report, which on gauntlet night is the
 * only record there is.
 */
async function resolveRoundOne(
  supabase: Awaited<ReturnType<typeof createServerSupabase>>,
  rows: FixtureRow[],
): Promise<RoundOneStatus[]> {
  const needReport = rows.filter((row) => row.score_a === null || row.score_b === null);
  const reports = await fetchRoundOneReports(supabase, needReport.map((row) => row.id));
  return rows.map((row) => {
    const resolved = resolveRoundOneResult(row, reports.get(row.id) ?? null);
    return {
      fixtureId: row.id,
      team_a: row.team_a,
      team_b: row.team_b,
      result: resolved.result,
      source: resolved.source,
      note: resolved.note,
    };
  });
}

/** The two results, or null while any round-1 series is still undecided. */
function resultsOf(statuses: RoundOneStatus[]): RoundOneResult[] | null {
  if (statuses.length === 0) return null;
  const results = statuses.map((status) => status.result);
  return results.every((result): result is RoundOneResult => result !== null) ? results : null;
}

/**
 * Everything the panel needs to render before it writes anything: the two
 * divisions' seeds, the draw it would make, the gauntlet rows already on the
 * season, and the round-2 pairings once round 1 has been played.
 */
export async function previewGauntletAction(season: string): Promise<PreviewResult> {
  const { supabase, allowed } = await staffClient();
  if (!allowed) return { ok: false, error: "Admins only." };

  try {
    const seeds = await seedsForSeason(season);
    const rows = await fetchGauntletRows(supabase, season);
    const r1 = rows.filter((row) => row.stage === "gauntlet_r1");
    const r2 = rows.filter((row) => row.stage === "gauntlet_r2");
    const roundOneResults = await resolveRoundOne(supabase, r1);
    const results = resultsOf(roundOneResults);

    let roundTwo: { team_a: string; team_b: string }[] | null = null;
    if (results) {
      try {
        roundTwo = seedRoundTwo(seeds, results);
      } catch {
        // A hand-edited round 1 that no longer names the seeds simply gets no
        // offer; seedRoundTwoAction reports the same refusal verbatim if the
        // admin somehow reaches it.
        roundTwo = null;
      }
    }

    return {
      ok: true,
      preview: {
        seeds,
        roundOne: drawGauntlet(seeds, null),
        existing: { r1, r2 },
        roundOneResults,
        roundTwo,
      },
    };
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }
}

/**
 * Replaces the season's gauntlet with a fresh draw: round 1 from the final
 * standings, round 2 as Bo3 placeholders behind each 4th seed, everything at
 * the one kickoff. Destructive on purpose — drawing twice must not double the
 * bracket — and scoped to the two gauntlet stages so the regular season and
 * the playoffs are untouched.
 */
export async function drawGauntletAction(
  season: string,
  kickoffIso: string | null,
): Promise<WriteResult> {
  const { supabase, allowed } = await staffClient();
  if (!allowed) return { ok: false, error: "Admins only." };

  let fixtures: GauntletFixtureDraft[];
  try {
    fixtures = drawGauntlet(await seedsForSeason(season), kickoffIso);
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }

  const { error: deleteError } = await supabase
    .from("fixtures")
    .delete()
    .eq("season", season)
    .in("stage", GAUNTLET_STAGES);
  if (deleteError) return { ok: false, error: deleteError.message };

  const { error: insertError } = await supabase
    .from("fixtures")
    .insert(fixtures.map((fixture) => ({ ...fixture, season })));
  if (insertError) return { ok: false, error: insertError.message };

  revalidatePath("/schedule");
  return { ok: true, count: fixtures.length };
}

/**
 * Fills the round-2 placeholders in from round 1's results — the fixtures'
 * own scores, or the captains' reports on the night, resolved exactly as the
 * preview resolves them. Each pairing names a 4th seed, which is what the
 * placeholder row already carries in team_a, so the update matches on that
 * name rather than on a position.
 */
export async function seedRoundTwoAction(season: string): Promise<WriteResult> {
  const { supabase, allowed } = await staffClient();
  if (!allowed) return { ok: false, error: "Admins only." };

  let rows: FixtureRow[];
  let pairings: { team_a: string; team_b: string }[];
  try {
    const seeds = await seedsForSeason(season);
    rows = await fetchGauntletRows(supabase, season);
    const statuses = await resolveRoundOne(supabase, rows.filter((row) => row.stage === "gauntlet_r1"));
    const results = resultsOf(statuses);
    if (!results) {
      const blocked = statuses.filter((status) => !status.result);
      const why = blocked.map((status) => status.note).filter(Boolean).join(" ");
      return {
        ok: false,
        error: why || "Round 1 has no reported result yet, from a fixture score or a captain's report.",
      };
    }
    pairings = seedRoundTwo(seeds, results);
  } catch (e) {
    return { ok: false, error: messageOf(e) };
  }

  const roundTwo = rows.filter((row) => row.stage === "gauntlet_r2");
  const played = roundTwo.find((row) => row.team_a && row.team_b && row.score_a !== null);
  if (played) {
    return {
      ok: false,
      error: `${played.team_a} vs ${played.team_b} is already played — edit it in the fixtures editor instead.`,
    };
  }

  let count = 0;
  for (const pairing of pairings) {
    const target = roundTwo.find(
      (row) => normalizeTeamName(row.team_a) === normalizeTeamName(pairing.team_a),
    );
    if (!target) {
      return {
        ok: false,
        error: `No round-2 fixture is waiting on ${pairing.team_a} — draw the gauntlet again first.`,
      };
    }
    const { error } = await supabase
      .from("fixtures")
      .update({ team_a: pairing.team_a, team_b: pairing.team_b })
      .eq("id", target.id);
    if (error) return { ok: false, error: error.message };
    count += 1;
  }

  revalidatePath("/schedule");
  return { ok: true, count };
}
