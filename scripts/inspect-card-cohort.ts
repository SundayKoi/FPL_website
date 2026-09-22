/**
 * Prints one week's rating cohort, role by role: every player the cards were
 * ranked against, with the raw number behind each bar input and the
 * percentile that number got.
 *
 * Written because inspect-card-scores.ts stops one step short of the
 * question people actually ask. It says a card's Laning bar is 29; the next
 * question is always "29 out of what?", and the answer is the other mids'
 * CS at 10, gold at 10 and duelling that week. No page shows those, and a
 * percentile is meaningless without the numbers it was taken over. Like
 * that script, this calls the real aggregation and the real percentile
 * function, so the ranks it prints are the ranks the cards got.
 *
 * Run: npx tsx scripts/inspect-card-cohort.ts [YYYY-MM-DD week] [ROLE]
 * The week defaults to the current Eastern-calendar Monday and must be a
 * Monday. ROLE is raw_stats' spelling (TOP, JUNGLE, MIDDLE, BOTTOM,
 * UTILITY) or the card's label (Top, Jungle, Mid, Bot, Support); blank
 * prints every role.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY. Read-only.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { CARD_METRICS, createCardPercentiles, scoreWeightsForRole, type CardMetric, type CardPercentile } from "../src/lib/cards/build";
import { barsForRole, MEASURE_LABELS, type MeasureKey } from "../src/lib/cards/measures";
import { fetchAllCardSeasons } from "../src/lib/cards/queries";
import { mondayOf } from "../src/lib/packs/week";
import { fetchAllPages } from "../src/lib/supabase/pagination";
import { aggregateWeeklyPlayerRows, type WeeklyRawStatRow } from "../src/lib/stats/weekly";
import type { PlayerAggRow } from "../src/lib/stats/types";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

/** raw_stats' spelling, which is what role_mode and the weights are keyed by. */
const ROLE_ORDER = ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"];

/** The card's role labels, upper-cased, back to raw_stats' spelling — the
 *  owner reads "Mid" off a card and should not have to know it is stored
 *  as MIDDLE. */
const ROLE_ALIASES: Record<string, string> = { MID: "MIDDLE", BOT: "BOTTOM", SUPPORT: "UTILITY" };

/** createCardPercentiles' threshold: a smaller role group is ranked against
 *  the whole week instead. Restated here only for the header. */
const ROLE_COHORT_MIN = 4;

interface BarInput {
  metric: CardMetric;
  label: string;
  /** Decimal places: 2 for rates, 1 for percentages, 0 for counts and the
   *  at-10 numbers, whose fractions say nothing. */
  digits: number;
  invert?: boolean;
}

/** One input to a bar's mean — or a group of inputs averaged first, which
 *  then counts as a single input. */
type BarPart = BarInput | BarInput[];

interface BarSpec {
  parts: BarPart[];
  /** Half the bar (or all of it) comes from per-game totals — gameTotals in
   *  measures.ts — which the agg row does not carry. */
  perGame?: "half" | "all";
}

const KDA: BarInput = { metric: "kda", label: "kda", digits: 2 };
const KILLS: BarInput = { metric: "killsPerMinute", label: "k/min", digits: 2 };
const KP: BarInput = { metric: "avg_kp_pct", label: "kp%", digits: 1 };
const DEATHS: BarInput = { metric: "deathsPerMinute", label: "d/min", digits: 2, invert: true };
const ASSISTS: BarInput = { metric: "assistsPerMinute", label: "a/min", digits: 2 };
const DMG: BarInput = { metric: "avg_dmg_per_min", label: "dmg/min", digits: 0 };
const DMG_SHARE: BarInput = { metric: "avg_dmg_share_pct", label: "dmg%", digits: 1 };

/**
 * What each bar is the mean of. This mirrors measureValues in
 * src/lib/cards/build.ts and has to change with it: the percentiles below
 * come from the real function, but which of them make up a bar is only
 * restated here.
 */
const BAR_INPUTS: Record<MeasureKey, BarSpec> = {
  combat: { parts: [KDA, KILLS, KP, DEATHS] },
  damage: { parts: [DMG, DMG_SHARE] },
  economy: {
    parts: [
      { metric: "avg_cs_per_min", label: "cs/min", digits: 2 },
      { metric: "avg_gold_per_min", label: "gold/min", digits: 0 },
    ],
  },
  laning: {
    parts: [
      { metric: "avg_cs_at_10", label: "cs@10", digits: 0 },
      { metric: "avg_gold_at_10", label: "gold@10", digits: 0 },
      [
        { metric: "soloKillsPerMinute", label: "solo/min", digits: 2 },
        { metric: "firstBloodsPerGameOrZero", label: "fb/g", digits: 2 },
      ],
    ],
  },
  vision: { parts: [{ metric: "avg_vision_per_min", label: "vis/min", digits: 2 }], perGame: "half" },
  survival: { parts: [DEATHS], perGame: "half" },
  presence: { parts: [KP, ASSISTS] },
  impact: { parts: [DMG_SHARE, KP] },
  objectives: { parts: [], perGame: "all" },
  turrets: { parts: [], perGame: "all" },
};

function mean(values: number[]): number {
  return values.reduce((sum, value) => sum + value, 0) / (values.length || 1);
}

/** Blank means every role; anything else has to name one, so a typo fails
 *  loudly instead of printing an empty report. */
export function resolveRole(requested: string): string | null {
  const role = requested.trim().toUpperCase();
  if (!role) return null;
  const resolved = ROLE_ALIASES[role] ?? role;
  if (!ROLE_ORDER.includes(resolved)) {
    throw new Error(`Role must be one of ${ROLE_ORDER.join(", ")} (or Top, Jungle, Mid, Bot, Support); got "${requested}"`);
  }
  return resolved;
}

/** A non-Monday would match no games and print "no games" for a week that
 *  had plenty — say so instead. (Noon UTC is mid-morning ET, safely inside
 *  the day.) */
export function resolveWeek(requested: string, now = new Date()): string {
  const week = requested.trim();
  if (!week) return mondayOf(now);
  const noon = new Date(`${week}T12:00:00Z`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(week) || Number.isNaN(noon.getTime()) || week !== mondayOf(noon)) {
    throw new Error(`Week must be a Monday (Eastern) in YYYY-MM-DD form; got "${requested}"`);
  }
  return week;
}

/** The week's raw rows, windowed and trimmed exactly as fetchWeekCards
 *  (src/lib/cards/queries.ts) does — a different boundary would rank a
 *  different cohort from the one the cards were built on. */
async function fetchWeekRows(supabase: SupabaseClient, season: string, week: string): Promise<WeeklyRawStatRow[]> {
  const start = new Date(`${week}T00:00:00.000Z`);
  start.setUTCDate(start.getUTCDate() - 1);
  const end = new Date(`${week}T00:00:00.000Z`);
  end.setUTCDate(end.getUTCDate() + 8);
  const rows = await fetchAllPages<WeeklyRawStatRow>((from, to) => supabase.from("raw_stats").select("*")
    .eq("season", season).gte("game_date", start.toISOString()).lt("game_date", end.toISOString())
    .order("id").range(from, to));
  return rows.filter((row) => row.game_date && mondayOf(new Date(row.game_date)) === week);
}

function describeInput(row: PlayerAggRow, input: BarInput, percentile: CardPercentile): { text: string; rank: number } {
  const rank = percentile(row, input.metric, input.invert);
  const value = CARD_METRICS[input.metric](row).toFixed(input.digits);
  return { text: `${input.label} ${value} (p${Math.round(rank)})`, rank };
}

function describeBar(row: PlayerAggRow, bar: MeasureKey, percentile: CardPercentile): string {
  const spec = BAR_INPUTS[bar];
  const label = MEASURE_LABELS[bar];
  if (spec.perGame === "all") return `${label}: (built from per-game totals, not shown)`;

  const texts: string[] = [];
  const ranks: number[] = [];
  for (const part of spec.parts) {
    if (Array.isArray(part)) {
      const group = part.map((input) => describeInput(row, input, percentile));
      texts.push(`[${group.map((item) => item.text).join(" · ")}]`);
      ranks.push(mean(group.map((item) => item.rank)));
    } else {
      const item = describeInput(row, part, percentile);
      texts.push(item.text);
      ranks.push(item.rank);
    }
  }
  if (spec.perGame === "half") return `${label}: ${texts.join(" · ")} · (per-game half not shown)`;
  // The bar's own percentile, before the card squeezes it into 20-99 —
  // the same number inspect-card-scores.ts prints for it.
  return `${label} p${Math.round(mean(ranks))}: ${texts.join(" · ")}`;
}

function describePlayer(row: PlayerAggRow, percentile: CardPercentile): string {
  const lines = [
    `  ${row.summoner_name}#${row.tag}  ${row.games} game${row.games === 1 ? "" : "s"}  ${row.wins}-${row.games - row.wins}  win ${Math.round(row.winrate_pct)}%`,
  ];
  for (const bar of barsForRole(row.role_mode)) lines.push(`      ${describeBar(row, bar, percentile)}`);
  return lines.join("\n");
}

function describeWeights(roleMode: string): string {
  const weights = Object.entries(scoreWeightsForRole(roleMode))
    .map(([key, weight]) => `${key === "win" ? "win" : MEASURE_LABELS[key as MeasureKey]} ${weight}`)
    .join(" · ");
  // Winning goes into the score as the raw rate, not ranked — see buildCard.
  return `  Weights: ${weights}  (win is the raw win rate, not a percentile)`;
}

/** Stable, and the order a reader scans a results table in. */
function byRecordThenName(a: PlayerAggRow, b: PlayerAggRow): number {
  return (
    b.winrate_pct - a.winrate_pct ||
    a.summoner_name.localeCompare(b.summoner_name) ||
    a.tag.localeCompare(b.tag)
  );
}

export async function inspectCohort(supabase: SupabaseClient, requestedWeek: string, requestedRole: string): Promise<void> {
  const week = resolveWeek(requestedWeek);
  const onlyRole = resolveRole(requestedRole);

  for (const { league, season } of await fetchAllCardSeasons(supabase)) {
    const games = await fetchWeekRows(supabase, season, week);
    if (games.length === 0) {
      console.log(`[${league}] Season ${season}: no games in the week of ${week}.`);
      continue;
    }
    const cohort = aggregateWeeklyPlayerRows(games);
    const percentile = createCardPercentiles(cohort);

    const byRole = new Map<string, PlayerAggRow[]>();
    for (const row of cohort) {
      const group = byRole.get(row.role_mode);
      if (group) group.push(row);
      else byRole.set(row.role_mode, [row]);
    }
    // The five real roles in lane order, then anything the ingest could not
    // place — those players were ranked too, so they are printed too.
    const roles = [
      ...ROLE_ORDER.filter((role) => byRole.has(role)),
      ...[...byRole.keys()].filter((role) => !ROLE_ORDER.includes(role)).sort(),
    ].filter((role) => !onlyRole || role === onlyRole);

    console.log(`\n=== ${league} · season ${season} · week of ${week} · ${cohort.length} players ===`);
    console.log(
      "Each bar is the mean of its inputs' percentiles; [ ] is one input averaged from its parts.\n" +
        "Deaths rank fewest-first, so a high p on d/min means few deaths.",
    );
    if (roles.length === 0) {
      console.log(`[${league}] Season ${season}: nobody played ${onlyRole} in the week of ${week}.`);
      continue;
    }

    for (const role of roles) {
      const players = [...(byRole.get(role) ?? [])].sort(byRecordThenName);
      const basis =
        players.length >= ROLE_COHORT_MIN ? "ranked within the role" : `fewer than ${ROLE_COHORT_MIN}, ranked against the whole week`;
      console.log(`\n${role} (${players.length} in cohort; ${basis})`);
      for (const row of players) console.log(describePlayer(row, percentile));
      console.log(describeWeights(role));
    }
  }
}

async function main(): Promise<void> {
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  // argv first, then the workflow inputs — a workflow_dispatch field left
  // blank arrives as an empty string and must fall through to the default.
  await inspectCohort(
    supabase,
    process.argv[2] || process.env.COHORT_WEEK || "",
    process.argv[3] || process.env.COHORT_ROLE || "",
  );
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
