// The atlas (spec §5): every place a collector's squads have walked in a
// season, the encounters and ghosts they met, the landmarks the league has
// named after whoever reached a place first, and how close each route's
// road is to walked end to end.
//
// Derived, not stored: the codex is computed from the collector's CLAIMED
// runs. A run claimed since the atlas shipped carries its own record in
// its outcome (outcome.atlas, stamped by the claim with atlasStamp); an
// older run's places are re-derived from its seed (forksFor), its
// encounters from its clock (encountersFor), and its ghosts are not known.
// Only the stamps count toward a road's reward — award_expedition_road
// counts them in SQL, and `counted` below counts them the same way — so a
// collector's history counts only if the owner stamps it
// (scripts/backfill-expedition-atlas.ts).
//
// This module reads the road (it titles the places a collector has seen),
// so a client component takes its types and nothing else: the page, a
// server component, builds the Atlas and hands the panel only that. What
// it hands over never names a place the collector has not reached — an
// unseen place is a count, and a league landmark there says who and when,
// never where. The numbers the browser does need live in client-safe
// modules and are re-exported here: the road sizes in forks.ts, the
// rewards in config.ts.
//
// Pure: no clock of its own, no randomness, no database. Deliberately not
// `server-only` so the backfill script can run it under tsx.

import { EXPEDITION_TIERS, ROAD_REWARDS, type ExpeditionTierKey, type RoadReward } from "./config";
import type { RoadCompany } from "./company";
import { ROAD_SIZES } from "./forks";
import { encountersFor, type EncounterKey } from "./journal";
import { ENCOUNTER_KEYS, isEncounterKey, readAtlasStamp, roadOf, type AtlasGhost, type AtlasStamp, type RunTier } from "./queries";
import { ROADS, forksFor } from "./routes";
import type { WeatherKey } from "./weather";

export { ROAD_REWARDS, ROAD_SIZES, readAtlasStamp, type AtlasGhost, type AtlasStamp, type RoadReward };

// === what a claim stamps =====================================================
//
// The stamp's shape and its reader live with the row mapper (queries.ts),
// which reads it off every claimed outcome, and are re-exported above:
// journal.ts reads queries.ts, so queries.ts cannot read this module.

/** An encounter as the claim holds it: journal.ts's, after the company
 *  was read over it. */
interface MetOnRoad {
  leg: number;
  key: string;
  alone?: boolean;
}

/**
 * The stamp for a run being claimed: the places its road holds (`forks`,
 * forksFor's answer for the run — the road the resolver just walked), the
 * encounters the squad met in leg order, and the ghosts among them with
 * their graves. A rival encounter with nobody on the road (`alone`) was a
 * cache under a cairn, and is recorded as the cache it was; a ghost is
 * named only when the company names it.
 */
export function atlasStamp(
  run: { tier: RunTier },
  forks: readonly { key: string }[],
  encounters: readonly MetOnRoad[],
  company: RoadCompany | null,
): AtlasStamp {
  if (run.tier === "lost") return { places: [], encounters: [], ghosts: [] };
  const met = [...encounters].sort((a, b) => a.leg - b.leg);
  const ghosts: AtlasGhost[] = [];
  for (const encounter of met) {
    if (encounter.key !== "ghost") continue;
    const ghost = company?.ghosts.find((entry) => entry.leg === encounter.leg);
    if (ghost) ghosts.push({ grave: ghost.graveId, name: ghost.cardName, owner: ghost.name });
  }
  return {
    places: forks.map((fork) => fork.key),
    encounters: met.map((encounter) => (encounter.key === "rival" && encounter.alone ? "cache" : encounter.key)).filter(isEncounterKey),
    ghosts,
  };
}

// === the places, by key ======================================================

interface PlaceEntry {
  tier: ExpeditionTierKey;
  title: string;
}

/** Every place on every road, by key. Keys are unique across routes (the
 *  landmarks' primary key relies on it); routes.test.ts holds ROADS to its
 *  sizes, and atlas.test.ts holds the keys unique. */
const PLACES: ReadonlyMap<string, PlaceEntry> = new Map(
  (Object.keys(ROADS) as ExpeditionTierKey[]).flatMap((tier) => ROADS[tier].flat().map((place) => [place.key, { tier, title: place.title }] as const)),
);

/** A place's title, for a place the reader has reached; null for a key no
 *  road holds. */
export function placeTitle(key: string): string | null {
  return PLACES.get(key)?.title ?? null;
}

/** The route a place is on; null for a key no road holds. */
export function placeTier(key: string): ExpeditionTierKey | null {
  return PLACES.get(key)?.tier ?? null;
}

// === the words ================================================================

/** "the Legend Hunt", "the Gilded Road": a route's name mid-sentence. */
export function routeName(tier: ExpeditionTierKey): string {
  const label = EXPEDITION_TIERS[tier]?.label ?? tier;
  return label.startsWith("The ") ? `the ${label.slice(4)}` : `the ${label}`;
}

/** What each encounter is, in the plain words the panel prints. */
export const ENCOUNTER_WORDS: Readonly<Record<EncounterKey, string>> = Object.freeze({
  merchant: "A merchant",
  stranded: "A stranger's lost card",
  storm: "A storm",
  cache: "An old cache",
  rival: "A rival squad",
  shrine: "A wayside shrine",
  hunter: "A relic hunter",
  ghost: "A ghost",
});

/** "a place's title, mid-sentence": "The drowned chapel" → "the drowned chapel". */
function midSentence(title: string): string {
  return title.startsWith("The ") ? `the ${title.slice(4)}` : title;
}

/**
 * The news when a claim names a landmark: "Ann was first to the drowned
 * chapel on the Legend Hunt." Several at once read as one sentence.
 */
export function firstNamedLine(name: string, titles: string[], tier?: ExpeditionTierKey): string {
  const places = titles.map(midSentence);
  const list = places.length <= 1 ? (places[0] ?? "a new place") : `${places.slice(0, -1).join(", ")} and ${places[places.length - 1]}`;
  return `${name} was first to ${list}${tier ? ` on ${routeName(tier)}` : ""}.`;
}

/** What a road pays when it is walked, in words: "2 map fragments and a
 *  free pack". Nothing for a rite. */
export function rewardWords(reward: RoadReward): string {
  const parts: string[] = [];
  if (reward.fragments > 0) parts.push(`${reward.fragments} map fragment${reward.fragments === 1 ? "" : "s"}`);
  if (reward.comp) parts.push("a free pack");
  return parts.length === 0 ? "nothing" : parts.join(" and ");
}

// === the codex ================================================================

/** A claimed run, as the atlas reads it (fetchAtlasRuns). */
export interface AtlasRun {
  id: number;
  tier: RunTier | string;
  startedAt: string;
  resolvesAt: string;
  claimedAt: string | null;
  forks: number;
  rules: number;
  convoy: number | null;
  /** A campaign's handed-down road. */
  road: string[] | null;
  /** outcome.atlas, or null on a run claimed before the atlas. */
  stamp: AtlasStamp | null;
}

/** A landmark as fetchLandmarks reads it: one per named place a season. */
export interface AtlasLandmark {
  season: string;
  place: string;
  discordId: string;
  username: string;
  runId: number;
  reachedAt: string;
}

/** A road award as fetchAtlasAwards reads it. */
export interface AtlasAward {
  tier: string;
  fragments: number;
  comp: boolean;
  awardedAt: string;
}

/** Who reached a place first. */
export interface AtlasLandmarkView {
  by: string;
  /** The reader named it. */
  mine: boolean;
  /** The namer's trophy wall carries their crest (base camp). */
  crest: boolean;
  at: string;
}

/** A place the collector has seen. */
export interface AtlasPlace {
  key: string;
  title: string;
  /** How many of the season's claimed runs walked it. */
  times: number;
  /** When a squad first came home from it. */
  firstAt: string;
  landmark: AtlasLandmarkView | null;
}

export interface AtlasMeeting {
  key: EncounterKey;
  words: string;
  times: number;
}

export interface AtlasGhostMet {
  name: string;
  owner: string;
  at: string;
}

/** One route's road in the codex. Serialisable. */
export interface AtlasRoad {
  tier: ExpeditionTierKey;
  label: string;
  /** The route mid-sentence: "the Legend Hunt". */
  name: string;
  /** The reward in words: "2 map fragments". The panel prints the words
   *  it is handed rather than importing them from here. */
  pays: string;
  /** How many places the road holds (ROAD_SIZES). */
  size: number;
  /** Distinct places seen this season, from every claimed run. */
  seen: number;
  /** Distinct places the stamps show: what the reward counts. */
  counted: number;
  /** The places seen, first seen first. Unseen places are only a count:
   *  size − places.length. */
  places: AtlasPlace[];
  /** The league's landmarks on this road at places the collector has not
   *  seen: who reached them and when, never where. */
  unseenLandmarks: AtlasLandmarkView[];
  meetings: AtlasMeeting[];
  ghosts: AtlasGhostMet[];
  /** Claimed runs of this route this season. */
  runs: number;
  reward: RoadReward;
  /** Paid already this season. */
  awarded: { fragments: number; comp: boolean; at: string } | null;
}

/** The whole codex for one collector and one season. Serialisable: what
 *  the page hands the Atlas tab. */
export interface Atlas {
  /** Every route with a road, in the board's order. */
  roads: AtlasRoad[];
  /** The landmarks this collector named, first named first. */
  named: { key: string; title: string; tier: ExpeditionTierKey; at: string }[];
  /** Claimed runs read. */
  runs: number;
}

export interface AtlasOptions {
  /** fetchAtlasAwards' answer: which roads were paid this season. */
  awards?: AtlasAward[];
  /** The reader, for which landmarks are theirs. A landmark named by one
   *  of `runs` is theirs either way. */
  viewer?: string | null;
  /** Discord ids whose trophy wall shows a crest (base camp, wall 2). */
  crests?: ReadonlySet<string>;
  /** The weather a run launched under (weatherOfRun), for re-deriving an
   *  unstamped run's encounters as its journal drew them. */
  weatherOf?: (run: AtlasRun) => WeatherKey | null;
}

/**
 * What a claimed run walked: its stamp when it has one, else re-derived
 * from its row. A derived run's ghosts are unknown (the company that named
 * them was never stored), and a ghost it drew is left out rather than
 * guessed — with nobody in the graveyard that draw was a cache.
 */
export function walkedBy(
  run: AtlasRun,
  weather: WeatherKey | null = null,
): { places: string[]; encounters: EncounterKey[]; ghosts: AtlasGhost[]; stamped: boolean } {
  if (run.stamp) return { ...run.stamp, stamped: true };
  const tier = run.tier as ExpeditionTierKey;
  if (!(tier in ROAD_SIZES)) return { places: [], encounters: [], ghosts: [], stamped: false };
  const places = forksFor(tier, roadOf(run)).map((place) => place.key);
  const encounters = encountersFor({ id: run.id, tier, startedAt: run.startedAt, resolvesAt: run.resolvesAt, forks: run.forks, rules: run.rules, convoy: run.convoy }, null, weather)
    .map((encounter) => encounter.key)
    .filter((key) => key !== "ghost");
  return { places, encounters, ghosts: [], stamped: false };
}

const ROUTE_ORDER = (Object.keys(EXPEDITION_TIERS) as ExpeditionTierKey[]).filter((tier) => ROAD_SIZES[tier] > 0);

/**
 * The codex: the collector's claimed runs of one season, grouped by route,
 * with the league's landmarks for that season laid over the places the
 * collector has seen. Titles only for places seen; every other place on a
 * road is a count.
 */
export function atlasFor(runs: AtlasRun[], landmarks: AtlasLandmark[] = [], options: AtlasOptions = {}): Atlas {
  const claimed = runs
    .filter((run) => run.claimedAt !== null && run.tier !== "lost" && (run.tier as string) in ROAD_SIZES)
    .sort((a, b) => Date.parse(a.claimedAt!) - Date.parse(b.claimedAt!) || a.id - b.id);
  const runIds = new Set(claimed.map((run) => run.id));
  const crests = options.crests ?? new Set<string>();
  const landmarkView = (landmark: AtlasLandmark): AtlasLandmarkView => ({
    by: landmark.username,
    mine: runIds.has(landmark.runId) || (options.viewer != null && landmark.discordId === options.viewer),
    crest: crests.has(landmark.discordId),
    at: landmark.reachedAt,
  });
  const byPlace = new Map(landmarks.map((landmark) => [landmark.place, landmark]));

  const roads: AtlasRoad[] = ROUTE_ORDER.map((tier) => {
    const mine = claimed.filter((run) => run.tier === tier);
    const places = new Map<string, { times: number; firstAt: string }>();
    const counted = new Set<string>();
    const meetings = new Map<EncounterKey, number>();
    const ghosts: AtlasGhostMet[] = [];
    for (const run of mine) {
      const walked = walkedBy(run, run.stamp ? null : (options.weatherOf?.(run) ?? null));
      for (const key of new Set(walked.places)) {
        if (walked.stamped) counted.add(key);
        const entry = places.get(key);
        if (entry) entry.times += 1;
        else places.set(key, { times: 1, firstAt: run.claimedAt! });
      }
      for (const key of walked.encounters) meetings.set(key, (meetings.get(key) ?? 0) + 1);
      for (const ghost of walked.ghosts) ghosts.push({ name: ghost.name, owner: ghost.owner, at: run.claimedAt! });
    }
    const seenPlaces: AtlasPlace[] = [...places.entries()].flatMap(([key, entry]) => {
      const title = placeTitle(key);
      if (!title) return [];
      const landmark = byPlace.get(key);
      return [{ key, title, times: entry.times, firstAt: entry.firstAt, landmark: landmark ? landmarkView(landmark) : null }];
    });
    const unseenLandmarks = landmarks
      .filter((landmark) => placeTier(landmark.place) === tier && !places.has(landmark.place))
      .sort((a, b) => Date.parse(a.reachedAt) - Date.parse(b.reachedAt))
      .map(landmarkView);
    const award = options.awards?.find((entry) => entry.tier === tier) ?? null;
    return {
      tier,
      label: EXPEDITION_TIERS[tier].label,
      name: routeName(tier),
      pays: rewardWords(ROAD_REWARDS[tier]),
      size: ROAD_SIZES[tier],
      seen: places.size,
      counted: counted.size,
      places: seenPlaces,
      unseenLandmarks,
      meetings: ENCOUNTER_KEYS.filter((key) => meetings.has(key)).map((key) => ({ key, words: ENCOUNTER_WORDS[key], times: meetings.get(key)! })),
      ghosts,
      runs: mine.length,
      reward: ROAD_REWARDS[tier],
      awarded: award ? { fragments: award.fragments, comp: award.comp, at: award.awardedAt } : null,
    };
  });

  const named = landmarks
    .filter((landmark) => landmarkView(landmark).mine)
    .sort((a, b) => Date.parse(a.reachedAt) - Date.parse(b.reachedAt))
    .flatMap((landmark) => {
      const entry = PLACES.get(landmark.place);
      return entry ? [{ key: landmark.place, title: entry.title, tier: entry.tier, at: landmark.reachedAt }] : [];
    });

  return { roads, named, runs: claimed.length };
}

/**
 * Whether the stamps now cover a route's whole road this season — the
 * claim's cue to call award_expedition_road, which counts the same stamps
 * again under its own rules and pays at most once. A rite has no road.
 */
export function roadComplete(atlas: Atlas, tier: ExpeditionTierKey): boolean {
  const road = atlas.roads.find((entry) => entry.tier === tier);
  return road !== undefined && road.size > 0 && road.counted >= road.size;
}
