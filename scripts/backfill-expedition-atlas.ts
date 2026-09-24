/**
 * Stamps the atlas onto expedition runs claimed before it shipped, and
 * names the landmarks those runs reached first.
 *
 * Since the atlas shipped, every claim writes what its squad walked into
 * the run's outcome (outcome.atlas) and names the places it was first to
 * this season. Runs claimed before then carry no stamp: the Atlas tab
 * still shows their places (it re-derives them), but a road award counts
 * only stamps, and nobody's name is on the places they reached first.
 * Running this makes that history count (spec §9, decision 8: optional,
 * the owner's call):
 *
 *   1. every claimed run without a stamp gets one — its places re-derived
 *      from its seed exactly as its journal showed them, its encounters
 *      re-derived under the weather it launched in, no ghosts (the company
 *      that named them was never stored), and `backfilled: true`;
 *   2. landmarks are named in claimed_at order, oldest first, through
 *      name_expedition_landmarks — first claim wins, and a place already
 *      named (by a live claim since the atlas shipped) keeps its namer;
 *   3. with --award, every road the stamps now cover is paid through
 *      award_expedition_road, once per collector, season and route. Off by
 *      default: it moves fragments (and, for the Legendary route, packs).
 *
 * Run: npx tsx scripts/backfill-expedition-atlas.ts --dry-run [--season S5] [--award]
 * --dry-run reads everything and prints the plan without writing. Without
 * it the plan is applied. --season limits it to one league's season.
 *
 * Needs SUPABASE_URL + SUPABASE_SERVICE_ROLE_KEY, and the
 * expedition_atlas migration applied (it reads and writes its tables).
 * Safe to run twice: a stamped run is skipped, and both RPCs are
 * idempotent.
 */
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { pathToFileURL } from "node:url";
import { ROAD_REWARDS, ROAD_SIZES, placeTitle, readAtlasStamp, walkedBy, type AtlasRun, type AtlasStamp, type RoadReward } from "../src/lib/expeditions/atlas";
import { EXPEDITION_TIERS, type ExpeditionTierKey } from "../src/lib/expeditions/config";
import { fetchFixturesSince } from "../src/lib/expeditions/queries";
import { watchWeeksOf, weatherOfRun, type WeatherKey } from "../src/lib/expeditions/weather";
import { fetchAllPages } from "../src/lib/supabase/pagination";

function requireEnv(name: string): string {
  const value = process.env[name];
  if (!value) throw new Error(`${name} is not set`);
  return value;
}

// === the plan (pure) =========================================================

/** A claimed run as the backfill reads it: the atlas's view of the run,
 *  plus whose it is, its season, and its whole outcome to stamp into. */
export interface BackfillRun extends AtlasRun {
  discordId: string;
  season: string;
  claimedAt: string;
  outcome: Record<string, unknown> | null;
}

export interface StampStep {
  runId: number;
  discordId: string;
  season: string;
  tier: ExpeditionTierKey;
  stamp: AtlasStamp;
}

export interface NameStep {
  runId: number;
  discordId: string;
  season: string;
  tier: ExpeditionTierKey;
  claimedAt: string;
  places: string[];
}

export interface AwardStep {
  discordId: string;
  season: string;
  tier: ExpeditionTierKey;
  reward: RoadReward;
}

export interface BackfillPlan {
  stamps: StampStep[];
  names: NameStep[];
  awards: AwardStep[];
  /** Claimed runs with no outcome to stamp into: reported, never touched. */
  skipped: number[];
}

export interface PlanInput {
  runs: BackfillRun[];
  /** The landmarks already named, every season read. */
  landmarks: { season: string; place: string }[];
  /** The roads already paid. */
  awards: { discordId: string; season: string; tier: string }[];
  /** The weather each run launched under, for its re-derived encounters. */
  weatherOf?: (run: BackfillRun) => WeatherKey | null;
}

const isRoute = (tier: string): tier is ExpeditionTierKey => tier in ROAD_SIZES;

/**
 * What the backfill will do, decided before anything is written: the stamps
 * missing, the landmarks each run would name in claimed_at order (skipping
 * places already named in its season, and places an earlier run in the
 * plan names first), and the roads the stamps — old and new — now cover
 * that nobody has been paid for.
 */
export function planAtlasBackfill(input: PlanInput): BackfillPlan {
  const runs = input.runs
    .filter((run) => run.claimedAt && isRoute(run.tier))
    .sort((a, b) => Date.parse(a.claimedAt) - Date.parse(b.claimedAt) || a.id - b.id);
  const named = new Set(input.landmarks.map((landmark) => `${landmark.season}|${landmark.place}`));
  const paid = new Set(input.awards.map((award) => `${award.discordId}|${award.season}|${award.tier}`));
  const walked = new Map<string, Set<string>>();
  const plan: BackfillPlan = { stamps: [], names: [], awards: [], skipped: [] };

  for (const run of runs) {
    const tier = run.tier as ExpeditionTierKey;
    let stamp = run.stamp;
    if (!stamp) {
      if (!run.outcome) {
        plan.skipped.push(run.id);
        continue;
      }
      const derived = walkedBy({ ...run, stamp: null }, input.weatherOf?.(run) ?? null);
      stamp = { places: derived.places, encounters: derived.encounters, ghosts: [], backfilled: true };
      plan.stamps.push({ runId: run.id, discordId: run.discordId, season: run.season, tier, stamp });
    }

    const firsts = [...new Set(stamp.places)].filter((place) => !named.has(`${run.season}|${place}`));
    for (const place of firsts) named.add(`${run.season}|${place}`);
    if (firsts.length > 0) plan.names.push({ runId: run.id, discordId: run.discordId, season: run.season, tier, claimedAt: run.claimedAt, places: firsts });

    const key = `${run.discordId}|${run.season}|${tier}`;
    const places = walked.get(key) ?? new Set<string>();
    for (const place of stamp.places) places.add(place);
    walked.set(key, places);
  }

  for (const [key, places] of walked) {
    const [discordId, season, tier] = key.split("|") as [string, string, ExpeditionTierKey];
    if (paid.has(key) || ROAD_SIZES[tier] === 0 || places.size < ROAD_SIZES[tier]) continue;
    plan.awards.push({ discordId, season, tier, reward: ROAD_REWARDS[tier] });
  }
  return plan;
}

/** The plan, in lines for the owner to read before anything is written. */
export function describePlan(plan: BackfillPlan, names: ReadonlyMap<string, string> = new Map(), award = false): string[] {
  const who = (id: string) => names.get(id) ?? id;
  const route = (tier: ExpeditionTierKey) => EXPEDITION_TIERS[tier].label;
  const lines: string[] = [];
  const bySeason = new Map<string, number>();
  for (const step of plan.stamps) bySeason.set(`${step.season} · ${route(step.tier)}`, (bySeason.get(`${step.season} · ${route(step.tier)}`) ?? 0) + 1);
  lines.push(`Stamps: ${plan.stamps.length} claimed run${plan.stamps.length === 1 ? "" : "s"} without one.`);
  for (const [group, count] of [...bySeason].sort()) lines.push(`  ${group}: ${count}`);
  if (plan.skipped.length > 0) lines.push(`Skipped (no outcome to stamp into): runs ${plan.skipped.join(", ")}`);

  const landmarkCount = plan.names.reduce((sum, step) => sum + step.places.length, 0);
  lines.push(`Landmarks: ${landmarkCount} place${landmarkCount === 1 ? "" : "s"} to name, oldest claim first.`);
  for (const step of plan.names) {
    const places = step.places.map((place) => placeTitle(place) ?? place).join(", ");
    lines.push(`  ${step.season} · ${route(step.tier)} · ${places} → ${who(step.discordId)} (run ${step.runId}, claimed ${step.claimedAt.slice(0, 10)})`);
  }

  lines.push(`Roads walked end to end and not yet paid: ${plan.awards.length}${award ? "" : " (pass --award to pay them)"}.`);
  for (const step of plan.awards) {
    const pays = [`${step.reward.fragments} fragment${step.reward.fragments === 1 ? "" : "s"}`, ...(step.reward.comp ? ["a free pack"] : [])].join(" + ");
    lines.push(`  ${step.season} · ${route(step.tier)} → ${who(step.discordId)}: ${pays}`);
  }
  return lines;
}

// === reading and writing =====================================================

interface RunDbRow {
  id: number;
  discord_id: string;
  season: string;
  tier: string;
  started_at: string;
  resolves_at: string;
  claimed_at: string;
  forks: number | null;
  rules: number | null;
  convoy: number | null;
  road: unknown;
  outcome: Record<string, unknown> | null;
}

async function readRuns(supabase: SupabaseClient, season: string | null): Promise<BackfillRun[]> {
  const rows = await fetchAllPages<RunDbRow>((from, to) => {
    let query = supabase
      .from("expedition_runs")
      .select("id, discord_id, season, tier, started_at, resolves_at, claimed_at, forks, rules, convoy, road, outcome")
      .not("claimed_at", "is", null)
      .neq("tier", "lost");
    if (season) query = query.eq("season", season);
    return query.order("claimed_at", { ascending: true }).order("id", { ascending: true }).range(from, to);
  }, { pageSize: 500, maxPages: 400 });
  return rows.map((row) => ({
    id: Number(row.id),
    discordId: row.discord_id,
    season: row.season,
    tier: row.tier,
    startedAt: row.started_at,
    resolvesAt: row.resolves_at,
    claimedAt: row.claimed_at,
    forks: Number(row.forks ?? 0),
    rules: Number(row.rules ?? 1),
    convoy: row.convoy === null || row.convoy === undefined ? null : Number(row.convoy),
    road: Array.isArray(row.road) && row.road.every((place) => typeof place === "string") ? (row.road as string[]) : null,
    stamp: readAtlasStamp(row.outcome?.atlas),
    outcome: row.outcome,
  }));
}

async function readState(supabase: SupabaseClient, season: string | null) {
  let landmarks = supabase.from("expedition_landmarks").select("season, place");
  let awards = supabase.from("expedition_atlas_awards").select("discord_id, season, tier");
  if (season) {
    landmarks = landmarks.eq("season", season);
    awards = awards.eq("season", season);
  }
  const [named, paid] = await Promise.all([landmarks, awards]);
  if (named.error || paid.error) {
    throw new Error(
      `The atlas tables cannot be read (${(named.error ?? paid.error)!.message}). Apply the expedition_atlas migration first.`,
    );
  }
  return {
    landmarks: (named.data as { season: string; place: string }[] | null) ?? [],
    awards: ((paid.data as { discord_id: string; season: string; tier: string }[] | null) ?? []).map((row) => ({ discordId: row.discord_id, season: row.season, tier: row.tier })),
  };
}

async function readNames(supabase: SupabaseClient, ids: string[]): Promise<Map<string, string>> {
  const names = new Map<string, string>();
  const wanted = [...new Set(ids)];
  for (let index = 0; index < wanted.length; index += 200) {
    const { data } = await supabase.from("betting_profiles").select("discord_id, username").in("discord_id", wanted.slice(index, index + 200));
    for (const row of (data as { discord_id: string; username: string | null }[] | null) ?? []) if (row.username) names.set(row.discord_id, row.username);
  }
  return names;
}

async function applyPlan(supabase: SupabaseClient, plan: BackfillPlan, runs: Map<number, BackfillRun>, award: boolean): Promise<string[]> {
  const log: string[] = [];
  let stamped = 0;
  for (const step of plan.stamps) {
    const run = runs.get(step.runId);
    if (!run?.outcome) continue;
    // A claimed outcome is written once, by resolve_expedition; the only
    // key added since is this one. Merge, never replace.
    const { error } = await supabase
      .from("expedition_runs")
      .update({ outcome: { ...run.outcome, atlas: step.stamp } })
      .eq("id", step.runId)
      .eq("discord_id", step.discordId)
      .not("claimed_at", "is", null);
    if (error) log.push(`stamp ${step.runId}: ${error.message}`);
    else stamped += 1;
  }
  log.push(`Stamped ${stamped} of ${plan.stamps.length} run(s).`);

  let namedCount = 0;
  for (const step of plan.names) {
    const { data, error } = await supabase.rpc("name_expedition_landmarks", { p_user: step.discordId, p_run: step.runId, p_places: step.places });
    if (error) log.push(`landmarks for run ${step.runId}: ${error.message}`);
    else namedCount += Array.isArray(data) ? data.length : 0;
  }
  log.push(`Named ${namedCount} landmark(s).`);

  if (award) {
    let paid = 0;
    for (const step of plan.awards) {
      const { data, error } = await supabase.rpc("award_expedition_road", { p_user: step.discordId, p_season: step.season, p_tier: step.tier });
      if (error) log.push(`award ${step.discordId} ${step.season} ${step.tier}: ${error.message}`);
      else if ((Array.isArray(data) ? data[0] : data)?.awarded === true) paid += 1;
    }
    log.push(`Paid ${paid} road(s).`);
  }
  return log;
}

export interface BackfillArgs {
  dryRun: boolean;
  award: boolean;
  season: string | null;
}

export function parseArgs(argv: string[]): BackfillArgs {
  const args: BackfillArgs = { dryRun: false, award: false, season: null };
  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];
    if (arg === "--dry-run") args.dryRun = true;
    else if (arg === "--award") args.award = true;
    else if (arg === "--season") {
      const season = argv[index + 1];
      if (!season || season.startsWith("--")) throw new Error("--season needs a season label, e.g. --season S5");
      args.season = season;
      index += 1;
    } else throw new Error(`Unknown argument "${arg}". Use --dry-run, --season <label>, --award.`);
  }
  return args;
}

export async function backfillAtlas(supabase: SupabaseClient, args: BackfillArgs): Promise<void> {
  const runs = await readRuns(supabase, args.season);
  const state = await readState(supabase, args.season);
  const oldest = runs.reduce((min, run) => Math.min(min, Date.parse(run.startedAt)), Date.now());
  const fixtures = runs.length > 0 ? await fetchFixturesSince(supabase, new Date(oldest - 86_400_000).toISOString(), 5000) : [];
  const watchWeeks = watchWeeksOf(fixtures);
  const plan = planAtlasBackfill({ ...state, runs, weatherOf: (run) => weatherOfRun(run, watchWeeks)?.key ?? null });
  const names = await readNames(supabase, [...plan.names.map((step) => step.discordId), ...plan.awards.map((step) => step.discordId)]);

  console.log(`${args.dryRun ? "[dry-run] " : ""}Atlas backfill${args.season ? ` for ${args.season}` : " for every season"}: ${runs.length} claimed run(s) read.`);
  for (const line of describePlan(plan, names, args.award)) console.log(line);
  if (args.dryRun) {
    console.log("[dry-run] Nothing was written.");
    return;
  }
  for (const line of await applyPlan(supabase, plan, new Map(runs.map((run) => [run.id, run])), args.award)) console.log(line);
}

async function main(): Promise<void> {
  const args = parseArgs(process.argv.slice(2));
  const supabase = createClient(requireEnv("SUPABASE_URL"), requireEnv("SUPABASE_SERVICE_ROLE_KEY"), {
    auth: { persistSession: false },
  });
  await backfillAtlas(supabase, args);
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  });
}
