/**
 * Export every pick and ban the league has recorded, from both places a
 * draft can live:
 *
 *   - the site's own drafter (match_drafts), and
 *   - drafter.lol links captains attached to match reports (match_reports.
 *     draft_url), which are fetched and parsed the same way the scouting
 *     page does it.
 *
 * Every match_drafts row is exported, whether or not its fixture still
 * exists (legacy academy fixtures were re-created under new ids; those
 * drafts come out with blank fixture columns rather than being dropped).
 * drafter.lol drafts come through the scouting page's own loader and are
 * added only for games the site's drafter does not hold. Team A is blue and
 * team B is red when a draft row never recorded sides, as on the board.
 *
 * Read-only. Set the website's public keys —
 *
 *   NEXT_PUBLIC_SUPABASE_URL      (or SUPABASE_URL)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * — in the shell or in .env.local, then:
 *
 *   npm run export:drafts                                  # both leagues, CSV to stdout
 *   npm run export:drafts -- --league=premier --out=s5.csv
 *   npm run export:drafts -- --season=A1 --format=json --out=academy.json
 *   npm run export:drafts -- --team="Neon Dynasty" --complete-only
 *   npm run export:drafts -- --stage=week_3
 *   npm run export:drafts -- --open                        # also the public /drafter lobbies
 *
 * CSV: one row per draft step (twenty per game), in the order they happened.
 * JSON: one object per game, each side with its bans and picks in order.
 *
 * Columns, in the CSV:
 *   league, season, stage, stage_label, fixture_id, scheduled_at, team_a,
 *   team_b, score_a, score_b, game_number, source (site | drafter.lol |
 *   open-lobby), draft_status (complete | partial), blue_team, red_team,
 *   winner_team, step_index (0–19), step_order (1–20), side, team,
 *   kind (pick|ban), slot (1–5 within side and kind), pick_order (1–10
 *   across both sides, picks only), ban_order (1–10, bans only),
 *   first_pick (true on the very first pick of the game), champion,
 *   skipped, player, role (top|jungle|mid|bot|support once captains
 *   confirmed positions), drafted_at.
 */

import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { actionForStep, LCS_DRAFT_STEPS } from "../src/lib/match-draft/rules";
import type { DraftStep, MatchDraftAction, MatchDraftPositions } from "../src/lib/match-draft/types";
import { stageMeta } from "../src/lib/schedule/format";
import { fetchScoutingHistory } from "../src/lib/scouting/queries";
import type { ScoutFixtureRow } from "../src/lib/scouting/types";

type League = "premier" | "academy";
const LEAGUES: League[] = ["premier", "academy"];
const ROLES = ["top", "jungle", "mid", "bot", "support"] as const;
const PAGE = 500;

function arg(name: string): string | undefined {
  const hit = process.argv.find((a) => a === `--${name}` || a.startsWith(`--${name}=`));
  if (!hit) return undefined;
  return hit.includes("=") ? hit.slice(name.length + 3) : "true";
}

function env(...names: string[]): string | undefined {
  for (const name of names) {
    const value = process.env[name];
    if (value) return value;
  }
  return undefined;
}

interface SiteDraftLite {
  id: string;
  fixture_id: string;
  game_number: number;
  blue_team_name: string | null;
  red_team_name: string | null;
  winner_team?: string | null;
  positions?: MatchDraftPositions | null;
  actions: MatchDraftAction[];
  created_at: string;
}

interface OpenDraftLite {
  id: string;
  lobby_id: string;
  game_number: number;
  blue_team_name: string | null;
  red_team_name: string | null;
  winner_team?: string | null;
  positions?: MatchDraftPositions | null;
  actions: MatchDraftAction[];
  created_at: string;
}

interface StepRow {
  league: string;
  season: string;
  stage: string;
  stage_label: string;
  fixture_id: string;
  scheduled_at: string;
  team_a: string;
  team_b: string;
  score_a: number | "";
  score_b: number | "";
  game_number: number;
  source: "site" | "drafter.lol" | "open-lobby";
  draft_status: "complete" | "partial";
  blue_team: string;
  red_team: string;
  winner_team: string;
  step_index: number;
  step_order: number;
  side: "blue" | "red";
  team: string;
  kind: "pick" | "ban";
  slot: number;
  pick_order: number | "";
  ban_order: number | "";
  first_pick: boolean;
  champion: string;
  skipped: boolean;
  player: string;
  role: string;
  drafted_at: string;
}

async function fetchAll<T>(build: (from: number, to: number) => PromiseLike<{ data: unknown; error: unknown }>): Promise<T[]> {
  const rows: T[] = [];
  for (let page = 0; page < 200; page += 1) {
    const from = page * PAGE;
    const { data, error } = await build(from, from + PAGE - 1);
    if (error) throw error;
    const batch = (data as T[]) ?? [];
    rows.push(...batch);
    if (batch.length < PAGE) return rows;
  }
  throw new Error("more pages than expected — raise the page cap");
}

/** The drafter's own step matcher, so an export never disagrees with the board. */
function actionAt(actions: MatchDraftAction[], step: DraftStep): MatchDraftAction | null {
  return actionForStep(actions, step);
}

/** Which role a champion was confirmed into, once captains set positions. */
function roleOf(positions: MatchDraftPositions | null | undefined, side: "blue" | "red", champion: string | null): string {
  if (!champion) return "";
  const list = positions?.[side];
  if (!list) return "";
  const index = list.findIndex((entry) => entry && entry.toLowerCase() === champion.toLowerCase());
  return index >= 0 ? ROLES[index] ?? "" : "";
}

function expand(
  league: string,
  source: StepRow["source"],
  draft: {
    game_number: number;
    blue_team_name: string | null;
    red_team_name: string | null;
    winner_team?: string | null;
    actions: MatchDraftAction[];
    positions?: MatchDraftPositions | null;
    created_at: string;
  },
  fixture: ScoutFixtureRow | null,
  fixtureId: string,
): StepRow[] {
  const rows: StepRow[] = [];
  let picks = 0;
  let bans = 0;
  const blue = draft.blue_team_name || fixture?.team_a || "";
  const red = draft.red_team_name || fixture?.team_b || "";
  const complete = LCS_DRAFT_STEPS.every((step) => actionAt(draft.actions, step) !== null);
  for (const step of LCS_DRAFT_STEPS) {
    const action = actionAt(draft.actions, step);
    const kind = step.kind;
    if (kind === "pick") picks += 1;
    else bans += 1;
    rows.push({
      league,
      season: fixture?.season ?? "",
      stage: fixture?.stage ?? "open",
      stage_label: fixture ? stageMeta(fixture.stage).label : "Open lobby",
      fixture_id: fixtureId,
      scheduled_at: fixture?.scheduled_at ?? "",
      team_a: fixture?.team_a ?? blue,
      team_b: fixture?.team_b ?? red,
      score_a: fixture?.score_a ?? "",
      score_b: fixture?.score_b ?? "",
      game_number: draft.game_number,
      source,
      draft_status: complete ? "complete" : "partial",
      blue_team: blue,
      red_team: red,
      winner_team: draft.winner_team ?? "",
      step_index: step.index,
      step_order: step.index + 1,
      side: step.side,
      team: step.side === "blue" ? blue : red,
      kind,
      slot: step.slot,
      pick_order: kind === "pick" ? picks : "",
      ban_order: kind === "ban" ? bans : "",
      first_pick: kind === "pick" && picks === 1,
      champion: action?.champion ?? "",
      skipped: Boolean(action?.skipped) || (action !== null && action.champion === null),
      player: action?.playerName ?? "",
      role: roleOf(draft.positions, step.side, action?.champion ?? null),
      drafted_at: draft.created_at,
    });
  }
  return rows;
}

function csvCell(value: unknown): string {
  const text = value === null || value === undefined ? "" : String(value);
  return /[",\n\r]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
}

function toCsv(rows: StepRow[]): string {
  if (rows.length === 0) return "";
  const keys = Object.keys(rows[0]) as (keyof StepRow)[];
  const lines = [keys.join(",")];
  for (const row of rows) lines.push(keys.map((key) => csvCell(row[key])).join(","));
  return `${lines.join("\n")}\n`;
}

/** One object per game: what each side banned and picked, in order. */
function toGames(rows: StepRow[]) {
  const games = new Map<string, Record<string, unknown>>();
  for (const row of rows) {
    const key = `${row.league}:${row.fixture_id}:${row.game_number}`;
    let game = games.get(key);
    if (!game) {
      game = {
        league: row.league,
        season: row.season,
        stage: row.stage,
        stage_label: row.stage_label,
        fixture_id: row.fixture_id,
        scheduled_at: row.scheduled_at,
        team_a: row.team_a,
        team_b: row.team_b,
        score: row.score_a === "" ? null : { a: row.score_a, b: row.score_b },
        game_number: row.game_number,
        source: row.source,
        status: row.draft_status,
        winner_team: row.winner_team || null,
        drafted_at: row.drafted_at,
        blue: { team: row.blue_team, bans: [] as unknown[], picks: [] as unknown[] },
        red: { team: row.red_team, bans: [] as unknown[], picks: [] as unknown[] },
        order: [] as unknown[],
      };
      games.set(key, game);
    }
    const side = game[row.side] as { bans: unknown[]; picks: unknown[] };
    const entry = {
      step: row.step_order,
      slot: row.slot,
      champion: row.champion || null,
      skipped: row.skipped,
      ...(row.kind === "pick"
        ? { pick_order: row.pick_order, first_pick: row.first_pick, player: row.player || null, role: row.role || null }
        : { ban_order: row.ban_order }),
    };
    (row.kind === "pick" ? side.picks : side.bans).push(entry);
    (game.order as unknown[]).push({ step: row.step_order, side: row.side, kind: row.kind, champion: row.champion || null });
  }
  return [...games.values()];
}

async function main() {
  const url = env("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL");
  const key = env("NEXT_PUBLIC_SUPABASE_ANON_KEY", "SUPABASE_ANON_KEY", "SUPABASE_SERVICE_ROLE_KEY");
  if (!url || !key) {
    console.error("Set NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY (the website's public keys). Read-only.");
    process.exit(1);
  }
  const supabase: SupabaseClient = createClient(url, key, { auth: { persistSession: false } });

  const leagueArg = arg("league")?.toLowerCase();
  const leagues = leagueArg ? LEAGUES.filter((league) => league === leagueArg) : LEAGUES;
  if (leagues.length === 0) {
    console.error(`--league must be premier or academy, not "${leagueArg}".`);
    process.exit(1);
  }
  const season = arg("season")?.toUpperCase();
  const stage = arg("stage");
  const team = arg("team")?.trim().toLowerCase();
  const completeOnly = arg("complete-only") === "true";
  const includeOpen = arg("open") === "true";
  const format = (arg("format") ?? "csv").toLowerCase();
  const out = arg("out");

  // 1. Every row of match_drafts, joined to its fixture when the fixture
  //    still exists. A draft whose fixture is gone (legacy academy fixtures
  //    were re-created under new ids) is still exported, with blank fixture
  //    columns, rather than silently dropped — which is what the first
  //    version did and why the count came up short.
  const [fixtures, siteDrafts] = await Promise.all([
    fetchAll<ScoutFixtureRow>((from, to) =>
      supabase.from("fixtures").select("id, season, stage, team_a, team_b, scheduled_at, best_of, score_a, score_b").order("id").range(from, to),
    ),
    fetchAll<SiteDraftLite>((from, to) =>
      supabase
        .from("match_drafts")
        .select("id, fixture_id, game_number, blue_team_name, red_team_name, winner_team, positions, actions, created_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));
  const leagueOf = (fixture: ScoutFixtureRow | null): string =>
    fixture ? (fixture.season.trim().toUpperCase().startsWith("A") ? "academy" : "premier") : "unknown";

  const rows: StepRow[] = [];
  const counts: Record<string, number> = {};
  const seen = new Set<string>();
  const keep = (league: string, fixture: ScoutFixtureRow | null, expanded: StepRow[]): boolean => {
    if (!leagues.includes(league as League) && league !== "unknown") return false;
    if (season && (fixture?.season.toUpperCase() ?? "") !== season) return false;
    if (stage && fixture?.stage !== stage) return false;
    if (completeOnly && expanded[0]?.draft_status !== "complete") return false;
    if (team && ![fixture?.team_a, fixture?.team_b, expanded[0]?.blue_team, expanded[0]?.red_team].some((name) => name?.trim().toLowerCase() === team)) return false;
    return true;
  };

  for (const draft of siteDrafts) {
    const fixture = fixturesById.get(draft.fixture_id) ?? null;
    const league = leagueOf(fixture);
    const expanded = expand(league, "site", draft, fixture, draft.fixture_id);
    seen.add(`${draft.fixture_id}:${draft.game_number}`);
    if (!keep(league, fixture, expanded)) continue;
    rows.push(...expanded);
    const bucket = fixture ? `${league}/site` : "site (fixture missing)";
    counts[bucket] = (counts[bucket] ?? 0) + 1;
  }

  // 2. drafter.lol links on match reports, through the scouting page's own
  //    loader (it fetches and parses each page). Only games the site's
  //    drafter does not already hold, so nothing is counted twice.
  const teamRows = await fetchAll<{ name: string }>((from, to) => supabase.from("league_teams").select("name").order("id").range(from, to));
  const leagueTeamNames = teamRows.map((row) => row.name);
  for (const league of leagues) {
    let history: Awaited<ReturnType<typeof fetchScoutingHistory>>;
    try {
      history = await fetchScoutingHistory(supabase, { league, leagueTeamNames });
    } catch (error) {
      console.error(`${league}: could not load drafter.lol drafts from match reports —`, error instanceof Error ? error.message : error);
      continue;
    }
    const scoutFixtures = new Map(history.fixtures.map((fixture) => [fixture.id, fixture]));
    for (const draft of history.drafts) {
      if (!draft.id.startsWith("drafter:")) continue;
      if (seen.has(`${draft.fixture_id}:${draft.game_number}`)) continue;
      const fixture = scoutFixtures.get(draft.fixture_id) ?? fixturesById.get(draft.fixture_id) ?? null;
      const expanded = expand(league, "drafter.lol", draft, fixture, draft.fixture_id);
      seen.add(`${draft.fixture_id}:${draft.game_number}`);
      if (!keep(league, fixture, expanded)) continue;
      rows.push(...expanded);
      counts[`${league}/drafter.lol`] = (counts[`${league}/drafter.lol`] ?? 0) + 1;
    }
  }

  if (includeOpen) {
    const open = await fetchAll<OpenDraftLite>((from, to) =>
      supabase
        .from("open_drafts")
        .select("id, lobby_id, game_number, blue_team_name, red_team_name, winner_team, positions, actions, created_at")
        .order("id")
        .range(from, to),
    );
    for (const draft of open) {
      const expanded = expand("open", "open-lobby", draft, null, draft.lobby_id);
      if (completeOnly && expanded[0]?.draft_status !== "complete") continue;
      if (team && ![draft.blue_team_name, draft.red_team_name].some((name) => name?.trim().toLowerCase() === team)) continue;
      rows.push(...expanded);
      counts["open-lobby"] = (counts["open-lobby"] ?? 0) + 1;
    }
  }

  // Newest fixture first, then game, then step — the order a person reads.
  rows.sort(
    (a, b) =>
      (b.scheduled_at || "").localeCompare(a.scheduled_at || "") ||
      a.fixture_id.localeCompare(b.fixture_id) ||
      a.game_number - b.game_number ||
      a.step_index - b.step_index,
  );

  const text = format === "json" ? `${JSON.stringify(toGames(rows), null, 2)}\n` : toCsv(rows);
  const summary = Object.entries(counts)
    .map(([source, n]) => `${n} ${source}`)
    .join(", ");
  if (out) {
    writeFileSync(out, text);
    console.error(`Wrote ${rows.length / LCS_DRAFT_STEPS.length} game(s) (${summary || "none"}), ${rows.length} step(s) to ${out}`);
  } else {
    process.stdout.write(text);
    console.error(`${rows.length / LCS_DRAFT_STEPS.length} game(s): ${summary || "none"}`);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
