// The expedition row shapes and their parsing: what a run, its stored
// outcome and a campaign look like once read, and the pure functions that
// turn a PostgREST row into them. No reads and nothing server-only, so the
// board's client components can hold these (hasRoad, roadOf) while the
// reads themselves stay in ./queries.ts, which re-exports all of this so
// every caller keeps one import path.

import type { ExpeditionMark, ExpeditionOutcome, ExpeditionTierKey, OutcomeGrade } from "./config";
// ROAD_RULES from forks.ts, not routes.ts: the board's client components
// read hasRoad/roadOf from this module (through ./queries.ts), and
// routes.ts is the road itself.
import { ROAD_RULES, type RecordedChoice, type RoadRef } from "./forks";
import type { CardFate, RouteEvent } from "./routes";
import type { RivalRecord, RoadCompany } from "./company";
import type { WeatherKey } from "./weather";
import type { AbilityKind } from "./archetypes";
import type { EncounterKey } from "./journal";
import type { CampaignKey, CampaignState, StageLog } from "./campaigns";

/**
 * The outcome as the ROW stores it, which is not quite what rollOutcome
 * returned: claim_expedition writes the payout facts plus the copy that
 * took the mark, and drops `briefHit` — that was reasoning about the
 * dollars, and the dollars are already banked. Anything that wants the
 * brief back recomputes it from `startedAt` (briefFor), which is exactly
 * how the claim itself derived it.
 */
export type ExpeditionRunOutcome = Omit<ExpeditionOutcome, "briefHit"> & {
  /** The copy that came home wearing the mark — null when none dropped. */
  bearer: number | null;
  /** What the forks made of the base payout. 1 on runs from before forks. */
  lootMultiplier: number;
  pushes: number;
  fragments: number;
  /** Every squad member's fate. Empty on runs from before forks. */
  fates: CardFate[];
  events: RouteEvent[];
  /** A Rescue's verdict. */
  rescued: boolean | null;
  /** Stamped by resolve_expedition when a successful rescue found nothing
   *  left to bring back — the hold had already closed. Absent on every run
   *  resolved before 20261007000001, which is why it is optional. */
  rescueMissed?: boolean;
  /** The Exorcism's cleansed card. */
  cleansed: number | null;
  /** The teams whose match day surged the payout. Empty on runs from
   *  before surges, and on any run whose squad was not playing. */
  surge: string[];
  /** A moment's echo: which edition card the route dropped a copy of, and
   *  which moment copy it echoed from. */
  echo: { slug: string; week: string; moment: number } | null;
  /** The real rivals the squad raced (company.ts), and who took the spot.
   *  Empty on runs from before COMPANY_RULES; optional so older fixtures
   *  and rows read as "none". */
  rivals?: RivalRecord[];
  /** The edges that counted on the run (archetypes.ts), as the claim
   *  stored them. Absent on runs stamped below ARCHETYPE_RULES. */
  abilities?: { copyId: number; title: string; kind: AbilityKind }[];
  /** What the run walked (atlas.ts), as the claim stamped it. Absent on
   *  runs claimed before the atlas, unless the backfill stamped them. */
  atlas?: AtlasStamp;
};

/** A run's tier, or 'lost': the HOLD on a lost card, which the board draws
 *  under "Missing" rather than "In the field". */
export type RunTier = ExpeditionTierKey | "lost";

export interface ExpeditionRun {
  id: number;
  tier: RunTier;
  /** card_inventory ids — three on a run, one on a hold. */
  squad: number[];
  shine: number;
  startedAt: string;
  resolvesAt: string;
  outcome: ExpeditionRunOutcome | null;
  claimedAt: string | null;
  forks: number;
  choices: RecordedChoice[];
  insured: boolean;
  /** A Rescue's hold, an Exorcism's card, or a hold's losing run. */
  target: number | null;
  fee: number;
  /** Encounters the sweep has applied (a storm's delay), by leg. */
  encounters: { key: string; leg: number }[];
  /** The rulebook the run launched under — see TRAIL_RULES. A squad in
   *  the field resolves under the rules it left with, never the newest. */
  rules: number;
  /** The convoy this run rides in, if any. */
  convoy: number | null;
  /** The campaign this run walks for (campaigns.ts), if any, and the road
   *  the campaign handed it — one place key per checkpoint. */
  campaign: number | null;
  road: string[] | null;
  /** Who else was on the road (company.ts), read by the page for a run in
   *  the field so the journal can name them. Not a column. */
  company?: RoadCompany | null;
  /** The weather the run launched under (weather.ts), derived by the page
   *  from its launch week. Not a column. */
  weather?: WeatherKey | null;
}

/** The rulebook version from which a run has the trail: encounters,
 *  storms, the stranded bounty, the match-day surge, the echo and the
 *  rival fork. Runs stamped below it walk their forks exactly as before. */
export const TRAIL_RULES = 2;

/** Whether this run launched under the trail rules. */
export function hasTrail(run: Pick<ExpeditionRun, "rules">): boolean {
  return run.rules >= TRAIL_RULES;
}

/** Whether this run walks a drawn road (ROAD_RULES in routes.ts): forks
 *  picked per run, the wider trail, the role calls. */
export function hasRoad(run: Pick<ExpeditionRun, "rules">): boolean {
  return run.rules >= ROAD_RULES;
}

/** The handle the road-drawing functions take, off a run row. */
export function roadOf(run: Pick<ExpeditionRun, "id" | "rules" | "convoy" | "forks"> & { road?: string[] | null }): RoadRef {
  return { runId: run.id, rules: run.rules, convoy: run.convoy, forks: run.forks, places: run.road ?? null };
}

/** Every column mapRun reads. readRun (runShared.ts) selects the same
 *  list, so a run read for a claim carries the rulebook and the convoy the
 *  page saw. */
export const RUN_COLUMNS = "id, tier, squad, shine, started_at, resolves_at, outcome, claimed_at, forks, choices, insured, target, fee, encounters, rules, convoy, campaign, road";

export interface RunDbRow {
  id: number;
  tier: string;
  squad: number[] | null;
  shine: number;
  started_at: string;
  resolves_at: string;
  outcome: {
    grade?: OutcomeGrade;
    dollars?: number;
    comp?: boolean;
    mark?: ExpeditionMark | null;
    bearer?: number | null;
    lootMultiplier?: number;
    pushes?: number;
    fragments?: number;
    fates?: CardFate[];
    events?: RouteEvent[];
    rescued?: boolean | null;
    cleansed?: number | null;
    surge?: string[] | null;
    echo?: { slug?: string; week?: string; moment?: number } | null;
    rivals?: RivalRecord[] | null;
    abilities?: unknown;
    atlas?: unknown;
  } | null;
  claimed_at: string | null;
  forks: number | null;
  choices: RecordedChoice[] | null;
  insured: boolean | null;
  target: number | null;
  fee: number | null;
  encounters?: { key: string; leg: number }[] | null;
  rules?: number | null;
  convoy?: number | null;
  campaign?: number | null;
  road?: unknown;
}

export function mapRun(row: RunDbRow): ExpeditionRun {
  return {
    id: row.id,
    tier: row.tier as RunTier,
    // A bigint[] column can't actually be null (the table says not null),
    // but a squad read as null would otherwise crash a board over one bad
    // row rather than showing the other runs.
    squad: (row.squad ?? []).map(Number),
    shine: row.shine,
    startedAt: row.started_at,
    resolvesAt: row.resolves_at,
    // A hold's outcome ({rescued}/{ransomed}/{expired}) has no grade; it
    // reads as "no outcome" here, and the board reads holds by their tier.
    outcome: row.outcome && row.outcome.grade
      ? {
          grade: row.outcome.grade,
          dollars: Number(row.outcome.dollars ?? 0),
          comp: row.outcome.comp === true,
          mark: row.outcome.mark ?? null,
          bearer: row.outcome.bearer === null || row.outcome.bearer === undefined ? null : Number(row.outcome.bearer),
          lootMultiplier: Number(row.outcome.lootMultiplier ?? 1),
          pushes: Number(row.outcome.pushes ?? 0),
          fragments: Number(row.outcome.fragments ?? 0),
          fates: Array.isArray(row.outcome.fates) ? row.outcome.fates : [],
          events: Array.isArray(row.outcome.events) ? row.outcome.events : [],
          rescued: row.outcome.rescued ?? null,
          cleansed: row.outcome.cleansed ?? null,
          surge: Array.isArray(row.outcome.surge) ? row.outcome.surge.map(String) : [],
          echo:
            row.outcome.echo && typeof row.outcome.echo.slug === "string" && typeof row.outcome.echo.week === "string"
              ? { slug: row.outcome.echo.slug, week: row.outcome.echo.week, moment: Number(row.outcome.echo.moment ?? 0) }
              : null,
          rivals: Array.isArray(row.outcome.rivals)
            ? row.outcome.rivals.filter((rival) => rival && typeof rival.who === "string").map((rival) => ({ who: rival.who, name: String(rival.name ?? "Another collector"), runId: Number(rival.runId ?? 0), won: rival.won === true }))
            : [],
          // Present only when the row carries them, so a run from before
          // either reads exactly as it always did.
          ...outcomeExtras(row.outcome),
        }
      : null,
    claimedAt: row.claimed_at,
    forks: Number(row.forks ?? 0),
    choices: Array.isArray(row.choices) ? row.choices : [],
    insured: row.insured === true,
    target: row.target === null || row.target === undefined ? null : Number(row.target),
    fee: Number(row.fee ?? 0),
    encounters: Array.isArray(row.encounters) ? row.encounters : [],
    // A row from before the column reads as the oldest rulebook: nothing
    // new ever applies to a run that predates the column that says it may.
    rules: Number(row.rules ?? 1),
    convoy: row.convoy === null || row.convoy === undefined ? null : Number(row.convoy),
    campaign: row.campaign === null || row.campaign === undefined ? null : Number(row.campaign),
    road: Array.isArray(row.road) && row.road.every((place) => typeof place === "string") ? (row.road as string[]) : null,
  };
}

// === the atlas stamp =========================================================

/** Every encounter a road can hold, in the order the atlas lists them. */
export const ENCOUNTER_KEYS: readonly EncounterKey[] = ["merchant", "stranded", "storm", "cache", "rival", "shrine", "hunter", "ghost"];

export function isEncounterKey(value: unknown): value is EncounterKey {
  return typeof value === "string" && (ENCOUNTER_KEYS as readonly string[]).includes(value);
}

/** A ghost met on the road: the dead card, its grave and whose it was. */
export interface AtlasGhost {
  grave: number;
  name: string;
  owner: string;
}

/**
 * What a claimed run walked, stored in its outcome (`outcome.atlas`) by
 * the claim (atlasStamp in atlas.ts). `places` are place keys in road
 * order — the list name_expedition_landmarks checks a naming against and
 * award_expedition_road counts. `backfilled` marks a stamp
 * scripts/backfill-expedition-atlas.ts wrote after the fact, whose
 * encounters were re-derived rather than recorded.
 *
 * Here rather than in atlas.ts because mapRun reads it off every claimed
 * outcome, and atlas.ts reads the journal, which reads TRAIL_RULES off
 * this module.
 */
export interface AtlasStamp {
  places: string[];
  encounters: EncounterKey[];
  ghosts: AtlasGhost[];
  backfilled?: boolean;
}

/** `outcome.atlas` as a row hands it over, checked: null for a run
 *  claimed before the atlas, or for anything that is not a stamp. */
export function readAtlasStamp(value: unknown): AtlasStamp | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const raw = value as { places?: unknown; encounters?: unknown; ghosts?: unknown; backfilled?: unknown };
  if (!Array.isArray(raw.places)) return null;
  const places = raw.places.filter((place): place is string => typeof place === "string" && place.length > 0);
  const encounters = Array.isArray(raw.encounters) ? raw.encounters.filter(isEncounterKey) : [];
  const ghosts = Array.isArray(raw.ghosts)
    ? raw.ghosts
        .filter((ghost): ghost is { grave?: unknown; name?: unknown; owner?: unknown } => Boolean(ghost) && typeof ghost === "object")
        .filter((ghost) => typeof ghost.name === "string")
        .map((ghost) => ({ grave: Number(ghost.grave ?? 0), name: String(ghost.name), owner: typeof ghost.owner === "string" ? ghost.owner : "Unknown" }))
    : [];
  return { places, encounters, ghosts, ...(raw.backfilled === true ? { backfilled: true } : {}) };
}

/** The claim's stored edges, checked. */
function readAbilities(value: unknown): { copyId: number; title: string; kind: AbilityKind }[] | null {
  if (!Array.isArray(value)) return null;
  return value
    .filter((entry): entry is { copyId?: unknown; title?: unknown; kind?: unknown } => Boolean(entry) && typeof entry === "object")
    .filter((entry) => typeof entry.title === "string" && typeof entry.kind === "string")
    .map((entry) => ({ copyId: Number(entry.copyId ?? 0), title: String(entry.title), kind: entry.kind as AbilityKind }));
}

/** The optional halves of a claimed outcome, each only when stored. */
function outcomeExtras(outcome: { abilities?: unknown; atlas?: unknown }): Pick<ExpeditionRunOutcome, "abilities" | "atlas"> {
  const abilities = readAbilities(outcome.abilities);
  const atlas = readAtlasStamp(outcome.atlas);
  return { ...(abilities ? { abilities } : {}), ...(atlas ? { atlas } : {}) };
}

// === campaigns ===============================================================

export interface CampaignDbRow {
  id: number;
  key: string;
  stage: number | null;
  runs: number[] | null;
  road: unknown;
  log: unknown;
  started_at: string;
  finished_at: string | null;
  abandoned: boolean | null;
  relic: number | null;
}

export function mapCampaign(row: CampaignDbRow): CampaignState {
  return {
    id: Number(row.id),
    key: row.key as CampaignKey,
    stage: Number(row.stage ?? 0),
    runs: (row.runs ?? []).map(Number),
    road: Array.isArray(row.road) && row.road.every((place) => typeof place === "string") ? (row.road as string[]) : null,
    log: Array.isArray(row.log) ? (row.log as StageLog[]) : [],
    startedAt: row.started_at,
    finishedAt: row.finished_at,
    abandoned: row.abandoned === true,
    relic: row.relic === null || row.relic === undefined ? null : Number(row.relic),
  };
}

/** Every column mapCampaign reads. */
export const CAMPAIGN_COLUMNS = "id, key, stage, runs, road, log, started_at, finished_at, abandoned, relic";
