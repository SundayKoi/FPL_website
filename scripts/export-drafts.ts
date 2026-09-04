/**
 * Export every pick and ban from the match drafter.
 *
 * "Who first-picked what this season", "how often does a team ban X",
 * "what did Blue take at P3": the drafter stores each game as a list of
 * twenty steps, and this flattens them into rows anyone can sort in a
 * spreadsheet or load into a notebook.
 *
 * Read-only, and it needs no secret: match_drafts and fixtures are public
 * tables. Set the same two variables the website's browser client uses —
 *
 *   NEXT_PUBLIC_SUPABASE_URL      (or SUPABASE_URL)
 *   NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * — in the shell or in .env.local, then:
 *
 *   npm run export:drafts                                # every draft, CSV to stdout
 *   npm run export:drafts -- --season=S5 --out=s5.csv    # one season, to a file
 *   npm run export:drafts -- --format=json --out=drafts.json
 *   npm run export:drafts -- --team="Neon Dynasty" --complete-only
 *   npm run export:drafts -- --stage=week_3
 *   npm run export:drafts -- --open                      # also the public /drafter lobbies
 *
 * CSV: one row per draft step (twenty per game), in the order they happened.
 * JSON: one object per game, each side with its bans and picks in order.
 *
 * Columns, in the CSV:
 *   season, stage, stage_label, fixture_id, scheduled_at, division,
 *   team_a, team_b, score_a, score_b, game_number, draft_status,
 *   blue_team, red_team, winner_team,
 *   step_index (0–19), step_order (1–20), side, team, kind (pick|ban),
 *   slot (1–5 within side and kind), pick_order (1–10 across both sides,
 *   picks only), ban_order (1–10, bans only), first_pick (true on the very
 *   first pick of the game), champion, skipped, player, role
 *   (top|jungle|mid|bot|support once captains confirmed positions),
 *   drafted_at (the draft row's last update).
 */

import { writeFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { actionForStep, LCS_DRAFT_STEPS } from "../src/lib/match-draft/rules";
import type { DraftStep, MatchDraftAction, MatchDraftPositions } from "../src/lib/match-draft/types";
import { stageMeta } from "../src/lib/schedule/format";

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

interface FixtureLite {
  id: string;
  season: string;
  stage: string;
  division: string | null;
  team_a: string | null;
  team_b: string | null;
  scheduled_at: string | null;
  score_a: number | null;
  score_b: number | null;
}

interface DraftLite {
  id: string;
  fixture_id: string | null;
  lobby_id?: string | null;
  game_number: number;
  status: "drafting" | "complete";
  blue_team_name: string | null;
  red_team_name: string | null;
  winner_team?: string | null;
  positions?: MatchDraftPositions | null;
  actions: MatchDraftAction[];
  updated_at: string;
}

interface StepRow {
  season: string;
  stage: string;
  stage_label: string;
  fixture_id: string;
  scheduled_at: string;
  division: string;
  team_a: string;
  team_b: string;
  score_a: number | "";
  score_b: number | "";
  game_number: number;
  draft_status: string;
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

/** The action taken at a step — the drafter's own matcher, so an export
 *  never disagrees with the board about which champion sat where. */
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

function expand(draft: DraftLite, fixture: FixtureLite | null): StepRow[] {
  const rows: StepRow[] = [];
  let picks = 0;
  let bans = 0;
  const blue = draft.blue_team_name ?? "";
  const red = draft.red_team_name ?? "";
  for (const step of LCS_DRAFT_STEPS) {
    const action = actionAt(draft.actions, step);
    const kind = step.kind;
    if (kind === "pick") picks += 1;
    else bans += 1;
    rows.push({
      season: fixture?.season ?? "",
      stage: fixture?.stage ?? "open",
      stage_label: fixture ? stageMeta(fixture.stage as never).label : "Open lobby",
      fixture_id: fixture?.id ?? draft.lobby_id ?? "",
      scheduled_at: fixture?.scheduled_at ?? "",
      division: fixture?.division ?? "",
      team_a: fixture?.team_a ?? blue,
      team_b: fixture?.team_b ?? red,
      score_a: fixture?.score_a ?? "",
      score_b: fixture?.score_b ?? "",
      game_number: draft.game_number,
      draft_status: draft.status,
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
      drafted_at: draft.updated_at,
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
    const key = `${row.fixture_id}:${row.game_number}`;
    let game = games.get(key);
    if (!game) {
      game = {
        season: row.season,
        stage: row.stage,
        stage_label: row.stage_label,
        fixture_id: row.fixture_id,
        scheduled_at: row.scheduled_at,
        division: row.division,
        team_a: row.team_a,
        team_b: row.team_b,
        score: row.score_a === "" ? null : { a: row.score_a, b: row.score_b },
        game_number: row.game_number,
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
      ...(row.kind === "pick" ? { pick_order: row.pick_order, first_pick: row.first_pick, player: row.player || null, role: row.role || null } : { ban_order: row.ban_order }),
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

  const season = arg("season");
  const stage = arg("stage");
  const team = arg("team")?.trim().toLowerCase();
  const completeOnly = arg("complete-only") === "true";
  const includeOpen = arg("open") === "true";
  const format = (arg("format") ?? "csv").toLowerCase();
  const out = arg("out");

  const [fixtures, drafts] = await Promise.all([
    fetchAll<FixtureLite>((from, to) =>
      supabase
        .from("fixtures")
        .select("id, season, stage, division, team_a, team_b, scheduled_at, score_a, score_b")
        .order("id")
        .range(from, to),
    ),
    fetchAll<DraftLite>((from, to) =>
      supabase
        .from("match_drafts")
        .select("id, fixture_id, game_number, status, blue_team_name, red_team_name, winner_team, positions, actions, updated_at")
        .order("id")
        .range(from, to),
    ),
  ]);
  const fixturesById = new Map(fixtures.map((fixture) => [fixture.id, fixture]));

  const rows: StepRow[] = [];
  for (const draft of drafts) {
    const fixture = draft.fixture_id ? (fixturesById.get(draft.fixture_id) ?? null) : null;
    if (!fixture) continue; // a draft whose fixture was deleted — nothing to say about it
    if (season && fixture.season !== season) continue;
    if (stage && fixture.stage !== stage) continue;
    if (completeOnly && draft.status !== "complete") continue;
    if (team && ![fixture.team_a, fixture.team_b, draft.blue_team_name, draft.red_team_name].some((name) => name?.trim().toLowerCase() === team)) continue;
    rows.push(...expand(draft, fixture));
  }

  if (includeOpen) {
    const open = await fetchAll<DraftLite>((from, to) =>
      supabase
        .from("open_drafts")
        .select("id, lobby_id, game_number, status, blue_team_name, red_team_name, winner_team, positions, actions, updated_at")
        .order("id")
        .range(from, to),
    );
    for (const draft of open) {
      if (completeOnly && draft.status !== "complete") continue;
      if (team && ![draft.blue_team_name, draft.red_team_name].some((name) => name?.trim().toLowerCase() === team)) continue;
      rows.push(...expand({ ...draft, fixture_id: null }, null));
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
  if (out) {
    writeFileSync(out, text);
    console.error(`Wrote ${rows.length / LCS_DRAFT_STEPS.length} game(s), ${rows.length} step(s) to ${out}`);
  } else {
    process.stdout.write(text);
  }
}

main().catch((error) => {
  console.error(error instanceof Error ? error.message : error);
  process.exit(1);
});
