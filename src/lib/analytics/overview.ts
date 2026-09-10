// The staff dashboard's data: the shape the database hands back, and the
// pure reading of it.
//
// The division of labour is deliberate. `analytics_overview` (migration
// 20261005000001) counts — it returns observed COUNTS and nothing else.
// Everything below turns counts into rates and compares them against
// src/lib/packs/config.ts, so a rate that changes in the config changes on
// this page in the same commit, and the database never holds a second copy
// of a number that lives in TypeScript.
//
// The one idea worth stating plainly: an observed rate is a sample, not a
// measurement. Ninety packs is not enough to tell 4% foils from 6%, and
// staff reading a dashboard will absolutely tune the economy off a number
// that is just noise. So every rate carries the band it could honestly be
// in, and `verdict` refuses to call anything off until the sample is big
// enough for the difference to mean something.

import {
  ECLIPSE_CHANCE,
  FOIL_CHANCE,
  FOIL_TYPE_WEIGHTS,
  GOD_PACK_CHANCE,
  PACK_SIZE,
  RARITY_BY_TIER,
  RARITY_WEIGHTS,
  SECRET_CHANCE,
  SHINY_CHANCE,
  SIGNED_CHANCE,
  STATTRAK_CHANCE,
  type CardTierKey,
  type MintableFoilType,
  type RarityClass,
} from "@/lib/packs/config";
import { DRIBB_CHANCE, DRIBB_COPIES } from "@/lib/cards/dribb";
import { MOMENT_PULL_CHANCE } from "@/lib/cards/moments";
import { TEAM_PULL_CHANCE } from "@/lib/cards/teamCards";

export interface WeekRow {
  week: string;
}

export interface PackWeek extends WeekRow {
  opens: number;
  paid: number;
  daily: number;
  comp: number;
  god_packs: number;
  rippers: number;
  /** Betting dollars spent on packs. Off the money anchor, so a comped or
   *  daily pack contributes nothing rather than a notional price.
   *
   *  Optional because a deploy and a migration are never atomic: a page
   *  shipped ahead of the function that adds this column would otherwise
   *  render "$NaN" across the whole table. Read it through weekSpend(). */
  spend?: number;
  /** Packs whose opening identity exists, and which could therefore have
   *  been a God Pack. Optional for the same deploy-gap reason as spend. */
  variant_known?: number;
}

export interface PullWeek extends WeekRow {
  copies: number;
  foil: number;
  signed_copies: number;
  shiny: number;
  stattrak: number;
  secret: number;
  eclipse: number;
  moment: number;
  team: number;
  champ: number;
  dribb: number;
}

export interface ActiveWeek extends WeekRow {
  active: number;
  packs: number;
  expeditions: number;
  gauntlet: number;
  betting: number;
  daily_games: number;
  market: number;
}

export interface AnalyticsOverview {
  generated_at: string;
  weeks: number;
  since: string;
  people: {
    profiles: number;
    patrons: number;
    joined: { week: string; joined: number }[];
    active: ActiveWeek[];
  };
  packs: { by_week: PackWeek[] };
  pulls: {
    by_week: PullWeek[];
    tiers: { tier: string; copies: number }[];
    parallels: { foil_type: string; copies: number }[];
    chases: {
      eclipses: number;
      dribbs: number;
      secrets: number;
      shinies: number;
      stattraks: number;
      copies_all_time: number;
    };
    dribb: { number: number; discord_id: string; season: string; acquired_at: string }[];
  };
  modes: {
    expeditions: (WeekRow & { launched: number; resolved: number; lost: number; players: number })[];
    expedition_tiers: { tier: string; runs: number }[];
    gauntlet: (WeekRow & { runs: number; players: number; cleared: number; fallen: number; banked: number; avg_round: number })[];
    showdown: (WeekRow & { hands: number; tables: number; pot: number; rake: number })[];
    daily_games: (WeekRow & { game: string; plays: number; players: number; paid_out: number })[];
    betting: (WeekRow & { bets: number; players: number; staked: number; paid: number })[];
    market: (WeekRow & { listed: number; sold: number; volume: number })[];
  };
  economy: {
    in_circulation: number;
    avg_balance: number;
    by_reason: { reason: string; entries: number; paid_in: number; paid_out: number; net: number }[];
    by_week: (WeekRow & { paid_in: number; paid_out: number })[];
  };
}

/** How far off a gate has to look before the page will say so. */
export type RateVerdict = "on" | "thin" | "high" | "low";

export interface RateRow {
  key: string;
  label: string;
  /** What the config says should happen. */
  expected: number;
  /** What did happen. */
  observed: number;
  hits: number;
  /** Pulls, or packs, depending on the gate. */
  sample: number;
  /** "per card" or "per pack" — the denominator, said out loud. */
  per: "card" | "pack";
  /** Two standard errors either side of the observed rate. */
  low: number;
  high: number;
  verdict: RateVerdict;
}

/**
 * A gate's observed rate, with the honest error band around it.
 *
 * The band is the normal approximation at two standard errors — near
 * enough for a dashboard, and the only thing standing between a quiet week
 * and somebody "fixing" a rate that was never broken. `thin` is returned
 * whenever the expected rate sits inside that band, which is the same as
 * saying: this sample cannot tell the difference yet.
 */
export function rateRow(
  key: string,
  label: string,
  hits: number,
  sample: number,
  expected: number,
  per: "card" | "pack" = "card",
): RateRow {
  const observed = sample > 0 ? hits / sample : 0;
  // Wald interval on the observed rate. Zero hits gives a zero-width band,
  // so the floor keeps a no-hits sample honestly uncertain rather than
  // claiming a rate of exactly zero.
  const variance = sample > 0 ? Math.max((observed * (1 - observed)) / sample, 1 / (sample * sample)) : 0;
  const margin = sample > 0 ? 2 * Math.sqrt(variance) : 1;
  const low = Math.max(0, observed - margin);
  const high = Math.min(1, observed + margin);
  let verdict: RateVerdict = "on";
  if (sample === 0) verdict = "thin";
  else if (expected >= low && expected <= high) verdict = "thin";
  else verdict = observed > expected ? "high" : "low";
  // A gate whose band excludes the expected rate is only interesting if the
  // sample could ever have shown it: at fewer than ~1/expected trials, one
  // lucky pull swings the whole reading.
  if (verdict !== "thin" && expected > 0 && sample * expected < 5) verdict = "thin";
  return { key, label, expected, observed, hits, sample, per, low, high, verdict };
}

const sum = <T>(rows: T[], pick: (row: T) => number) => rows.reduce((total, row) => total + pick(row), 0);

/** A week's pack spend, zero when the database predates the column. The
 *  page renders against whichever version of the function is live. */
export const weekSpend = (week: PackWeek): number => (Number.isFinite(week.spend) ? (week.spend as number) : 0);

/**
 * The God Pack's denominator: packs that could actually have been one.
 *
 * A God Pack is decided when the opening identity is created, so a pack
 * opened before that table existed was never a roll — it is not a miss.
 * Counting those as misses reported the gate several times colder than it
 * is, on a page whose entire job is saying when a gate is off. Falls back
 * to every open only when the database predates the column, where the two
 * are the same thing anyway.
 */
export const weekRolledForGod = (week: PackWeek): number =>
  Number.isFinite(week.variant_known) ? (week.variant_known as number) : week.opens;

/**
 * Every per-slot and per-pack gate the opener rolls, measured against what
 * the config says it should be.
 *
 * The denominators matter and are easy to get wrong: a foil is rolled per
 * CARD, a God Pack per PACK, and an Eclipse per Card-of-the-Week slot —
 * which is neither, so it is reported per pack with that stated rather
 * than silently divided by the wrong thing.
 */
export function pullRates(pulls: PullWeek[], packs: PackWeek[]): RateRow[] {
  const copies = sum(pulls, (week) => week.copies);
  const opens = sum(packs, (week) => week.opens);
  return [
    rateRow("foil", "Foil", sum(pulls, (w) => w.foil), copies, FOIL_CHANCE),
    // Per card over EVERY copy: since the autograph roll was normalised
    // (signedChance, 2026-09-10) SIGNED_CHANCE is the pack-level promise,
    // so all copies is the right denominator. Weeks before that read low
    // here by design — the old roll was SIGNED_CHANCE times the signed share.
    rateRow("signed", "Signed", sum(pulls, (w) => w.signed_copies), copies, SIGNED_CHANCE),
    rateRow("shiny", "Shiny", sum(pulls, (w) => w.shiny), copies, SHINY_CHANCE),
    rateRow("stattrak", "StatTrak", sum(pulls, (w) => w.stattrak), copies, STATTRAK_CHANCE),
    rateRow("secret", "Secret", sum(pulls, (w) => w.secret), copies, SECRET_CHANCE),
    rateRow("moment", "Moment", sum(pulls, (w) => w.moment), copies, MOMENT_PULL_CHANCE),
    rateRow("team", "Team plate", sum(pulls, (w) => w.team), copies, TEAM_PULL_CHANCE),
    rateRow("god", "God Pack", sum(packs, (w) => w.god_packs), sum(packs, weekRolledForGod), GOD_PACK_CHANCE, "pack"),
    rateRow("dribb", "Dribb", sum(pulls, (w) => w.dribb), opens, DRIBB_CHANCE, "pack"),
  ];
}

/**
 * The class mix — the headline of any rate change, because it is the one
 * gate every single pull passes through.
 *
 * Expected is the config's weight table normalised, and it is knowingly an
 * approximation: the guaranteed rare-or-better slot lifts the real mix
 * above the raw weights. The page says so rather than pretending the two
 * columns are the same measurement.
 */
export function classMix(tiers: { tier: string; copies: number }[]): {
  klass: RarityClass;
  copies: number;
  observed: number;
  expected: number;
}[] {
  const weights = sum(Object.values(RARITY_WEIGHTS), (weight) => weight);
  const counted = new Map<RarityClass, number>();
  for (const row of tiers) {
    // A moment, a plate and the Dribb file under their own tiers, which are
    // not player-card classes and are not part of this mix.
    const klass = RARITY_BY_TIER[row.tier as CardTierKey];
    if (!klass) continue;
    counted.set(klass, (counted.get(klass) ?? 0) + row.copies);
  }
  const inMix = sum([...counted.values()], (value) => value);
  return (Object.keys(RARITY_WEIGHTS) as RarityClass[]).map((klass) => ({
    klass,
    copies: counted.get(klass) ?? 0,
    observed: inMix > 0 ? (counted.get(klass) ?? 0) / inMix : 0,
    expected: RARITY_WEIGHTS[klass] / weights,
  }));
}

/** The parallel ladder, observed against its weights. */
export function parallelMix(parallels: { foil_type: string; copies: number }[]): {
  type: string;
  copies: number;
  observed: number;
  expected: number | null;
}[] {
  const mintable = parallels.filter((row) => row.foil_type in FOIL_TYPE_WEIGHTS);
  const total = sum(mintable, (row) => row.copies);
  const weights = sum(Object.values(FOIL_TYPE_WEIGHTS), (weight) => weight);
  return parallels.map((row) => ({
    type: row.foil_type,
    copies: row.copies,
    observed: total > 0 ? row.copies / total : 0,
    // Eclipse is not on the ladder — it comes through its own gate and has
    // no weight to be measured against.
    expected:
      row.foil_type in FOIL_TYPE_WEIGHTS
        ? FOIL_TYPE_WEIGHTS[row.foil_type as MintableFoilType] / weights
        : null,
  }));
}

/** How many of the five Dribbs are out, and how many can still be found. */
export function dribbStatus(found: number): { found: number; left: number; complete: boolean } {
  const out = Math.max(0, Math.min(DRIBB_COPIES, found));
  return { found: out, left: DRIBB_COPIES - out, complete: out >= DRIBB_COPIES };
}

/** Cards minted per pack — a sanity check that the opener is still
 *  printing PACK_SIZE, and the denominator behind every per-card rate. */
export function cardsPerPack(pulls: PullWeek[], packs: PackWeek[]): number {
  const opens = sum(packs, (week) => week.opens);
  return opens > 0 ? sum(pulls, (week) => week.copies) / opens : 0;
}

export const EXPECTED_CARDS_PER_PACK = PACK_SIZE;

/** The Eclipse gate, stated rather than measured: it rides on the
 *  Card-of-the-Week slots, so neither packs nor cards is its denominator
 *  and a rate column would be a fiction. */
export const ECLIPSE_GATE = ECLIPSE_CHANCE;
