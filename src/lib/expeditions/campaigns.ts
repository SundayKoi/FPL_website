// Campaigns: three runs that tell one story.
//
// A collector opts into one from the board and walks its three stages in
// order. Each run's grade and choices set the NEXT run's road — the
// places at its checkpoints are handed down by the campaign instead of
// drawn from the run's seed (RoadRef.places, forksFor) — so a poor scout
// opens the raid in the flooded works and a vault opened puts the
// Legendary's threshold behind the throne. Finish all three and the
// finale mints a campaign relic: a one-off copy of a survivor printed with
// the campaign's own frame, priced flat like a moment (RELIC_SHINE) and
// never boarding a route that can lose it.
//
// Pure. The database owns the state machine (20261014000001: start,
// bind, advance, abandon); this decides the roads and the words. The
// stage tiers are held equal to expedition_campaign_tier in SQL by
// campaigns.test.ts.

import type { CardFate } from "./routes";
import type { ExpeditionTierKey, OutcomeGrade } from "./config";
import { milesOf } from "./trail";

export type CampaignKey = "broken_map" | "lost_print";

export interface CampaignDef {
  key: CampaignKey;
  label: string;
  /** What it is, in a line for the board. */
  blurb: string;
  stages: [ExpeditionTierKey, ExpeditionTierKey, ExpeditionTierKey];
  /** The relic's frame ink. */
  accent: string;
}

export const CAMPAIGNS: Record<CampaignKey, CampaignDef> = {
  broken_map: {
    key: "broken_map",
    label: "The Broken Map",
    blurb: "A Scouting Run, a Deep Raid, a Legend Hunt. The scout's luck decides where the raid opens; the raid's nerve decides what the Legend Hunt finds at the end.",
    stages: ["scout", "raid", "legend"],
    accent: "#c9a46b",
  },
  lost_print: {
    key: "lost_print",
    label: "The Lost Print",
    blurb: "A Deep Raid, a Legend Hunt, the Legendary route. The raid's haul decides which door the hunt goes in by; the hunt's pushes decide what sings on the other side.",
    stages: ["raid", "legend", "legendary"],
    accent: "#c9b4ff",
  },
};

export const CAMPAIGN_ORDER: CampaignKey[] = ["broken_map", "lost_print"];

/** What a finished stage is remembered by — the campaign's log, and what
 *  nextRoad reads. */
export interface StageLog {
  tier: ExpeditionTierKey;
  grade: OutcomeGrade;
  pushes: number;
  /** Cards home or wounded. */
  survivors: number;
  /** The places the stage walked (empty for a stage on its own draw). */
  places: string[];
  claimedAt: string;
}

/** A campaign as the page and the claim hold it. */
export interface CampaignState {
  id: number;
  key: CampaignKey;
  /** Stages finished, 0–3. */
  stage: number;
  runs: number[];
  /** The road the next stage walks, or null on its own draw / after the last. */
  road: string[] | null;
  log: StageLog[];
  startedAt: string;
  finishedAt: string | null;
  abandoned: boolean;
  relic: number | null;
}

/** The tier the campaign's next stage runs on, or null once finished. */
export function nextTier(campaign: Pick<CampaignState, "key" | "stage">): ExpeditionTierKey | null {
  return CAMPAIGNS[campaign.key].stages[campaign.stage] ?? null;
}

/** Whether a run on `tier` can be bound to the campaign right now: the
 *  campaign is open, the tier is the stage's, and the stage has no run out. */
export function canBind(campaign: Pick<CampaignState, "key" | "stage" | "runs" | "finishedAt"> | null, tier: ExpeditionTierKey): boolean {
  if (!campaign || campaign.finishedAt !== null) return false;
  return nextTier(campaign) === tier && campaign.runs.length <= campaign.stage;
}

/**
 * The road the NEXT stage walks, from the stage just finished. Every
 * place is a key in ROADS (routes.ts); routes.test.ts holds them real.
 * Null after the last stage.
 */
export function nextRoad(key: CampaignKey, finished: StageLog): string[] | null {
  const stages = CAMPAIGNS[key].stages;
  const index = stages.indexOf(finished.tier);
  const next = stages[index + 1];
  if (!next) return null;
  const { grade, pushes, survivors } = finished;
  if (next === "raid") {
    // The scout's luck: a poor scout opens the raid in the flooded works,
    // a solid one at the reactor, a jackpot at the signal mast. The
    // second fork follows the nerve shown so far.
    return [grade === "poor" ? "waterworks" : grade === "solid" ? "reactor" : "mast", pushes > 0 ? "barricade" : "ridge"];
  }
  if (next === "legend") {
    // The raid's haul decides the way in; the squad that came home whole
    // finds the bell tower, one that did not finds the village empty;
    // the end is what the pushes earned — the vault for the reckless,
    // the sleeper for the careful, the throne for a jackpot.
    return [
      grade === "poor" ? "furnaces" : grade === "solid" ? "shaft" : "chapel",
      survivors >= 3 ? "belltower" : "village",
      grade === "jackpot" ? "throne" : pushes >= 2 ? "vault" : "sleeper",
    ];
  }
  // The Legendary route: a vault opened puts the threshold behind the
  // throne — the hunt's jackpot goes in by the gallery of doors, a solid
  // hunt by the threshold, a poor one by the stair that goes both ways.
  return [
    grade === "jackpot" ? "doors" : grade === "solid" ? "threshold" : "stairs",
    pushes >= 2 ? "choir" : pushes === 1 ? "singing" : "mirrors",
    survivors >= 3 ? "tide" : survivors === 2 ? "sky" : "rift",
    grade === "jackpot" ? "table" : "keeper",
  ];
}

/** One line for the board on what the last stage set up. */
export function roadStory(key: CampaignKey, campaign: Pick<CampaignState, "stage" | "road" | "log">): string | null {
  const def = CAMPAIGNS[key];
  if (campaign.stage >= 3) return null;
  const tier = def.stages[campaign.stage];
  const last = campaign.log[campaign.log.length - 1];
  if (!last || !campaign.road) return campaign.stage === 0 ? "The first stage walks its own draw. What it finds sets the road for the next." : null;
  const first = campaign.road[0];
  const opening: Record<string, string> = {
    waterworks: "the raid opens in the flooded works",
    reactor: "the raid opens at the reactor",
    mast: "the raid opens under the signal mast",
    furnaces: "the hunt goes in by the furnace hall",
    shaft: "the hunt goes in by the glowing shaft",
    chapel: "the hunt goes in by the drowned chapel",
    doors: "the route opens on the gallery of doors",
    threshold: "the route opens at the threshold",
    stairs: "the route opens on the stair that goes both ways",
  };
  const gradeWord = last.grade === "poor" ? "A poor" : last.grade === "solid" ? "A solid" : "A jackpot";
  const stageWord = tier === "raid" ? "scout" : tier === "legend" ? "raid" : "hunt";
  return `${gradeWord} ${stageWord}: ${opening[first] ?? `the next stage opens at ${first}`}.`;
}

/** The survivor who carries the relic: the one with the most miles, ties
 *  to the lower id. Null when nobody came home. */
export function relicBearer(fates: CardFate[], copies: { id: number; card?: { trail?: { miles?: number } | null } | null }[]): number | null {
  const home = new Set(fates.filter((fate) => fate.fate === "home" || fate.fate === "wounded").map((fate) => fate.id));
  let best: { id: number; miles: number } | null = null;
  for (const copy of copies) {
    if (!home.has(copy.id)) continue;
    const miles = milesOf(copy);
    if (!best || miles > best.miles || (miles === best.miles && copy.id < best.id)) best = { id: copy.id, miles };
  }
  return best?.id ?? null;
}
