// What the Gauntlet's tape says about its own balance.
//
// This module reads telemetry and produces a REPORT. It does not tune
// anything. That is the whole design: an algorithm that quietly nerfs
// whatever is winning turns a game into a treadmill — the player finds a
// line, the line stops working, and nobody ever tells them why. So the
// numbers get measured automatically and changed by hand, in a commit,
// with a note in the channel. Human in the loop.
//
// Two confounds are corrected for, because uncorrected they would point a
// balance pass at the wrong card:
//
//   1. ROUND DEPTH. A relic taken at round 6 only ever fights rounds 6-8,
//      which are the hardest rounds anyone reaches. Its raw win rate is
//      low because of WHEN it was held, not what it does. So performance
//      is measured as LIFT: actual wins minus the wins the same rounds
//      produced league-wide.
//   2. OFFER RATE. A relic can only be taken when it is offered, and the
//      offer is rarity-weighted. So popularity is measured as take rate
//      against the fair share of its own offers, never as a raw count.
//
// The output is a 2x2 the eye can read: popular/ignored against
// strong/weak. The interesting cells are the corners — a TRAP (everyone
// takes it, it loses) and a SLEEPER (nobody takes it, it wins).

import { CROSSROADS_BY_KEY, CROSSROADS_CATALOG } from "./crossroads";
import { FOE_PLANS } from "./foe";
import { RELIC_BY_KEY, type RelicFamily, type RelicRarity } from "./relics";

/** The tape rows this module reads — the read shape, not the write shape,
 *  so a report can be computed from anything that quacks like the table. */
export interface RoundSample {
  round: number;
  situation_key: string;
  choice_key: string;
  won: boolean;
  score: number;
  daring: number;
  relics: string[];
  run_id: number;
  /** The opponent's disposition. Null on rows from before it shipped. */
  plan_key?: string | null;
}

export interface OfferSample {
  round: number;
  offered: string[];
  taken: string;
}

/**
 * How far from its fair share a pick rate has to sit before the report
 * says anything. A relic offered three at a time has a fair share of 1/3;
 * a choice among four lines has 1/4. Under half of fair is IGNORED, over
 * 1.7x fair is DOMINANT — wide enough that ordinary preference isn't a
 * finding.
 */
export const IGNORED_AT = 0.5;
export const DOMINANT_AT = 1.7;

/** Win-rate lift, in points, before the report calls something strong or
 *  weak. The sim's own noise moves a 40-sample bucket by a few points, so
 *  the bar sits well outside it. */
export const LIFT_BAND = 0.07;

/** Below this many observations a bucket is reported but never flagged.
 *  A 3-for-3 relic is not a finding, it is three rounds. */
export const MIN_SAMPLE = 30;

export type BalanceFlag = "dominant" | "ignored" | "strong" | "weak" | "trap" | "sleeper" | "thin";

export interface ChoiceStat {
  key: string;
  label: string;
  /** Times the situation came up (the denominator every choice shares). */
  offered: number;
  taken: number;
  takeRate: number;
  /** Fair share of its own situation: 1 / (choices on the table). */
  fairShare: number;
  /** Rounds won when this call was made. */
  winRate: number;
  /** Win rate minus what the same rounds produced league-wide. */
  lift: number;
  avgDaring: number;
  avgScore: number;
  flags: BalanceFlag[];
}

export interface SituationStat {
  key: string;
  title: string;
  band: [number, number];
  seen: number;
  choices: ChoiceStat[];
}

export interface RelicStat {
  key: string;
  title: string;
  rarity: RelicRarity | "unknown";
  family: RelicFamily | "unknown";
  offered: number;
  taken: number;
  takeRate: number;
  /** Rounds fought while holding it. */
  rounds: number;
  winRate: number;
  lift: number;
  avgScore: number;
  flags: BalanceFlag[];
}

/** How a round went against each of the opponent's four dispositions.
 *  The plans are priced to be worth nothing on aggregate — this is where
 *  that claim meets real runs instead of a Monte Carlo. */
export interface PlanStat {
  key: string;
  title: string;
  rounds: number;
  winRate: number;
  lift: number;
  flags: BalanceFlag[];
}

export interface BalanceReport {
  /** Rounds and runs the report rests on — the first thing to read. */
  rounds: number;
  runs: number;
  offers: number;
  /** League-wide win rate per round, the baseline lift is measured from. */
  baseline: { round: number; rounds: number; winRate: number; avgScore: number }[];
  situations: SituationStat[];
  relics: RelicStat[];
  plans: PlanStat[];
  /** The findings, in plain language, worst first. Empty is a good week. */
  headlines: string[];
}

function rate(part: number, whole: number): number {
  return whole > 0 ? part / whole : 0;
}

/** Win rate and average score per round number, league-wide. Everything
 *  that follows is measured against this, never against a flat average —
 *  round 8 is not round 1 and a report that pretends otherwise blames the
 *  late relics for being late. */
function baselineOf(rows: RoundSample[]) {
  const byRound = new Map<number, { rounds: number; wins: number; score: number }>();
  for (const row of rows) {
    const bucket = byRound.get(row.round) ?? { rounds: 0, wins: 0, score: 0 };
    bucket.rounds += 1;
    bucket.wins += row.won ? 1 : 0;
    bucket.score += row.score;
    byRound.set(row.round, bucket);
  }
  return byRound;
}

/** Expected wins and score for a set of rounds, at league rates. */
function expected(
  rounds: number[],
  baseline: ReturnType<typeof baselineOf>,
): { wins: number; score: number } {
  let wins = 0;
  let score = 0;
  for (const round of rounds) {
    const bucket = baseline.get(round);
    if (!bucket || bucket.rounds === 0) continue;
    wins += bucket.wins / bucket.rounds;
    score += bucket.score / bucket.rounds;
  }
  return { wins, score };
}

/** Popularity and performance, each as at most one flag, plus `thin` when
 *  the sample is too small to mean anything. */
function flagsFor(
  takeRate: number,
  fairShare: number,
  lift: number,
  sample: number,
): BalanceFlag[] {
  if (sample < MIN_SAMPLE) return ["thin"];
  const flags: BalanceFlag[] = [];
  const share = fairShare > 0 ? takeRate / fairShare : 0;
  if (share >= DOMINANT_AT) flags.push("dominant");
  else if (share <= IGNORED_AT) flags.push("ignored");
  if (lift >= LIFT_BAND) flags.push("strong");
  else if (lift <= -LIFT_BAND) flags.push("weak");
  // The corners: the two combinations worth a commit.
  if (flags.includes("dominant") && flags.includes("weak")) flags.push("trap");
  if (flags.includes("ignored") && flags.includes("strong")) flags.push("sleeper");
  return flags;
}

function situationStats(rows: RoundSample[], baseline: ReturnType<typeof baselineOf>): SituationStat[] {
  const seen = new Map<string, RoundSample[]>();
  for (const row of rows) {
    const bucket = seen.get(row.situation_key);
    if (bucket) bucket.push(row);
    else seen.set(row.situation_key, [row]);
  }

  const stats: SituationStat[] = [];
  for (const situation of CROSSROADS_CATALOG) {
    const taken = seen.get(situation.key) ?? [];
    const fairShare = situation.choices.length > 0 ? 1 / situation.choices.length : 0;
    const choices: ChoiceStat[] = situation.choices.map((choice) => {
      const mine = taken.filter((row) => row.choice_key === choice.key);
      const wins = mine.filter((row) => row.won).length;
      const want = expected(mine.map((row) => row.round), baseline);
      const takeRate = rate(mine.length, taken.length);
      return {
        key: choice.key,
        label: choice.label,
        offered: taken.length,
        taken: mine.length,
        takeRate,
        fairShare,
        winRate: rate(wins, mine.length),
        lift: mine.length > 0 ? (wins - want.wins) / mine.length : 0,
        avgDaring: rate(mine.reduce((sum, row) => sum + row.daring, 0), mine.length),
        avgScore: rate(mine.reduce((sum, row) => sum + row.score, 0), mine.length),
        flags: flagsFor(
          takeRate,
          fairShare,
          mine.length > 0 ? (wins - want.wins) / mine.length : 0,
          taken.length,
        ),
      };
    });
    stats.push({
      key: situation.key,
      title: situation.title,
      band: situation.band,
      seen: taken.length,
      choices: choices.sort((a, b) => b.taken - a.taken),
    });
  }
  return stats.sort((a, b) => b.seen - a.seen);
}

/** A relic's fair share is 1 / (keys on the table), which is 3 in every
 *  shipped offer but is read off the row so a wider offer stays honest. */
function relicStats(
  rows: RoundSample[],
  offers: OfferSample[],
  baseline: ReturnType<typeof baselineOf>,
): RelicStat[] {
  const offered = new Map<string, number>();
  const taken = new Map<string, number>();
  let fairSum = 0;
  for (const offer of offers) {
    const share = offer.offered.length > 0 ? 1 / offer.offered.length : 0;
    fairSum += share;
    for (const key of offer.offered) offered.set(key, (offered.get(key) ?? 0) + 1);
    taken.set(offer.taken, (taken.get(offer.taken) ?? 0) + 1);
  }
  const fairShare = offers.length > 0 ? fairSum / offers.length : 0;

  // Rounds fought while holding each relic — a round contributes to every
  // relic on the row, which is the honest reading: they fought it together.
  const held = new Map<string, { rounds: number[]; wins: number; score: number }>();
  for (const row of rows) {
    for (const key of row.relics) {
      const bucket = held.get(key) ?? { rounds: [], wins: 0, score: 0 };
      bucket.rounds.push(row.round);
      bucket.wins += row.won ? 1 : 0;
      bucket.score += row.score;
      held.set(key, bucket);
    }
  }

  const keys = new Set<string>([...offered.keys(), ...taken.keys(), ...held.keys(), ...RELIC_BY_KEY.keys()]);
  const stats: RelicStat[] = [];
  for (const key of keys) {
    const def = RELIC_BY_KEY.get(key);
    const wasOffered = offered.get(key) ?? 0;
    const wasTaken = taken.get(key) ?? 0;
    const bucket = held.get(key) ?? { rounds: [], wins: 0, score: 0 };
    const want = expected(bucket.rounds, baseline);
    const rounds = bucket.rounds.length;
    const takeRate = rate(wasTaken, wasOffered);
    const lift = rounds > 0 ? (bucket.wins - want.wins) / rounds : 0;
    stats.push({
      key,
      title: def?.title ?? key,
      rarity: def?.rarity ?? "unknown",
      family: def?.family ?? "unknown",
      offered: wasOffered,
      taken: wasTaken,
      takeRate,
      rounds,
      winRate: rate(bucket.wins, rounds),
      lift,
      avgScore: rate(bucket.score, rounds),
      // Both halves need a sample: an unoffered relic can't have a take
      // rate, and an unheld one can't have a lift.
      flags: flagsFor(takeRate, fairShare, lift, Math.min(wasOffered, rounds)),
    });
  }
  return stats.sort((a, b) => b.offered - a.offered);
}

/** Per-disposition performance. Popularity means nothing here — nobody
 *  chooses which enemy they meet — so a plan is only ever flagged strong
 *  or weak, never dominant or ignored. */
function planStats(rows: RoundSample[], baseline: ReturnType<typeof baselineOf>): PlanStat[] {
  const byPlan = new Map<string, RoundSample[]>();
  for (const row of rows) {
    if (!row.plan_key) continue;
    const bucket = byPlan.get(row.plan_key);
    if (bucket) bucket.push(row);
    else byPlan.set(row.plan_key, [row]);
  }
  return FOE_PLANS.map((plan) => {
    const mine = byPlan.get(plan.key) ?? [];
    const wins = mine.filter((row) => row.won).length;
    const want = expected(mine.map((row) => row.round), baseline);
    const lift = mine.length > 0 ? (wins - want.wins) / mine.length : 0;
    const flags: BalanceFlag[] =
      mine.length < MIN_SAMPLE ? ["thin"] : lift >= LIFT_BAND ? ["strong"] : lift <= -LIFT_BAND ? ["weak"] : [];
    return {
      key: plan.key,
      title: plan.title,
      rounds: mine.length,
      winRate: rate(wins, mine.length),
      lift,
      flags,
    };
  }).sort((a, b) => a.lift - b.lift);
}

/** The findings, worst first — traps, then sleepers, then the plain
 *  outliers. Written as sentences because a human reads them. */
function headlinesOf(situations: SituationStat[], relics: RelicStat[], plans: PlanStat[]): string[] {
  const lines: string[] = [];
  const pct = (value: number) => `${Math.round(value * 100)}%`;
  const signed = (value: number) => `${value >= 0 ? "+" : ""}${Math.round(value * 100)}pts`;

  for (const relic of relics) {
    if (relic.flags.includes("trap")) {
      lines.push(
        `TRAP — ${relic.title} is taken ${pct(relic.takeRate)} of the time it is offered and runs ${signed(relic.lift)} against the round's baseline.`,
      );
    }
  }
  for (const relic of relics) {
    if (relic.flags.includes("sleeper")) {
      lines.push(
        `SLEEPER — ${relic.title} is taken only ${pct(relic.takeRate)} of the time but runs ${signed(relic.lift)}.`,
      );
    }
  }
  for (const situation of situations) {
    for (const choice of situation.choices) {
      if (choice.flags.includes("trap")) {
        lines.push(
          `TRAP CALL — "${choice.label}" (${situation.title}) is the pick ${pct(choice.takeRate)} of the time and runs ${signed(choice.lift)}.`,
        );
      } else if (choice.flags.includes("sleeper")) {
        lines.push(
          `SLEEPER CALL — "${choice.label}" (${situation.title}) is picked ${pct(choice.takeRate)} of the time and runs ${signed(choice.lift)}.`,
        );
      } else if (choice.flags.includes("ignored")) {
        lines.push(
          `DEAD CALL — "${choice.label}" (${situation.title}) is picked ${pct(choice.takeRate)} of the time against a fair share of ${pct(choice.fairShare)}.`,
        );
      }
    }
  }
  for (const plan of plans) {
    // A disposition is supposed to be a reallocation worth nothing. When
    // one measures strong or weak against the round baseline, the pricing
    // in foe.ts is off and the weights want re-measuring.
    if (plan.flags.includes("strong")) {
      lines.push(`EASY PLAN — runs meeting ${plan.title} clear ${signed(plan.lift)} more often than the round's baseline.`);
    } else if (plan.flags.includes("weak")) {
      lines.push(`HARD PLAN — runs meeting ${plan.title} clear ${signed(plan.lift)} against the round's baseline.`);
    }
  }
  for (const relic of relics) {
    if (relic.flags.includes("ignored") && !relic.flags.includes("sleeper")) {
      lines.push(`DEAD RELIC — ${relic.title} is passed ${pct(1 - relic.takeRate)} of the time it is offered.`);
    }
  }
  return lines;
}

/**
 * The week's report. Pure: hand it the tape and it hands back the read,
 * with no clock, no network, and no opinion about what to do next.
 */
export function buildBalanceReport(rows: RoundSample[], offers: OfferSample[]): BalanceReport {
  const baseline = baselineOf(rows);
  const situations = situationStats(rows, baseline);
  const relics = relicStats(rows, offers, baseline);
  const plans = planStats(rows, baseline);
  return {
    rounds: rows.length,
    runs: new Set(rows.map((row) => row.run_id)).size,
    offers: offers.length,
    baseline: [...baseline.entries()]
      .sort((a, b) => a[0] - b[0])
      .map(([round, bucket]) => ({
        round,
        rounds: bucket.rounds,
        winRate: rate(bucket.wins, bucket.rounds),
        avgScore: rate(bucket.score, bucket.rounds),
      })),
    situations,
    relics,
    plans,
    headlines: headlinesOf(situations, relics, plans),
  };
}

/** The situation a choice key belongs to — used by the report page to
 *  title an orphan row from a retired situation. */
export function situationTitleOf(key: string): string {
  return CROSSROADS_BY_KEY.get(key)?.title ?? key;
}
