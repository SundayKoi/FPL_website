// Tunables for Card Expeditions — send three owned cards out for a fixed
// stretch of hours and collect what they bring back. Everything the gates,
// the odds and the payouts depend on lives here so a balance pass is a
// one-file change: the RPC, the server actions and the UI read these
// constants and call these functions rather than restating any number.
//
// Pure on purpose (no supabase, no clock, no Math.random): `rollOutcome`
// takes the randomness as an argument the way src/lib/packs/rng.ts does, so
// the odds are unit-testable and a server-seeded roll is a drop-in.

import { PACK_COST, foilTypeOf, type FoilType } from "@/lib/packs/config";
// The guardrail below is measured against a click of /daily, so it reads
// the same constant the handler pays out rather than restating it, and
// re-exports it: this module is where the balance rule lives, so the rule
// and the number it is measured against should arrive together.
export { MAXED_DAILY_STREAK } from "@/lib/betting/daily";
import type { InventoryRow } from "@/lib/packs/queries";

/**
 * One owned copy, as an expedition reads it. This is card_inventory's row
 * (packs/queries.ts) under the name the feature talks in — expeditions only
 * ever look at `tier`, `foil`, `foilType`, `signed`, `card`, `role` and
 * `id`, but they are handed whole rows and aliasing keeps the two in step.
 */
export type CardCopy = InventoryRow;

/** The six runs, easiest first. The first three are the ladder anyone
 *  climbs; Rescue and Exorcism exist to undo what the ladder can do to a
 *  card; the Legendary route is the only place a card can die. */
export type ExpeditionTierKey = "scout" | "raid" | "legend" | "rescue" | "exorcism" | "legendary";

/** The worst a route can do to a card. Presentation reads it for the
 *  consent line on the launch card; `squadMeets` reads it to keep one-of-
 *  ones off any route past `wounded`. */
export type RouteRisk = "none" | "wounded" | "lost" | "dead";

/** Which card a run is FOR, beyond its squad: a Rescue names the lost
 *  card it goes after, an Exorcism names the afflicted card it cleanses. */
export type RouteTarget = "none" | "lost" | "afflicted";

/** The cosmetic an expedition can bring home — a mark on the profile, not
 *  a card. Worst to best; see MARK_RANK. */
export type ExpeditionMark = "trail" | "sigil" | "legend";

/** How well a run went. */
export type OutcomeGrade = "poor" | "solid" | "jackpot";

export interface ExpeditionTierDef {
  key: ExpeditionTierKey;
  label: string;
  /** How long the squad is away — and locked. */
  durationHours: number;
  /** Minimum squadShine to launch. */
  minShine: number;
  /** How many of the three must be foil. */
  minFoils: number;
  /** How many of the three must be autographed. */
  minSigned: number;
  /** Checkpoints where the run pauses and asks. See routes.ts. */
  forks: number;
  risk: RouteRisk;
  /** Betting dollars debited at launch. Zero for the ladder. */
  fee: number;
  /** Map fragments consumed at launch. */
  fragments: number;
  target: RouteTarget;
  /** What the run is for, in one line. */
  what: string;
}

/**
 * The ladder of runs. Each step asks for something a collection can only
 * answer with luck rather than grinding: shine accumulates over time, but
 * two foils and a signature do not, which is what keeps Legend Hunt a
 * thing a collector unlocks instead of a thing everyone runs.
 */
export const EXPEDITION_TIERS: Record<ExpeditionTierKey, ExpeditionTierDef> = {
  scout: {
    key: "scout", label: "Scouting Run", durationHours: 8, minShine: 0, minFoils: 0, minSigned: 0,
    forks: 1, risk: "none", fee: 0, fragments: 0, target: "none",
    what: "A short walk for pocket money. One fork — push for a bigger bag or camp and keep what you have. Nothing here can hurt a card.",
  },
  raid: {
    key: "raid", label: "Deep Raid", durationHours: 24, minShine: 12, minFoils: 1, minSigned: 0,
    forks: 2, risk: "wounded", fee: 0, fragments: 0, target: "none",
    what: "A day out with two forks. The reactor can irradiate a card; the brutal fork can harden one or send it home wounded.",
  },
  legend: {
    key: "legend", label: "Legend Hunt", durationHours: 48, minShine: 20, minFoils: 2, minSigned: 1,
    forks: 3, risk: "lost", fee: 0, fragments: 0, target: "none",
    what: "Two days and three forks. Camping at the wrong checkpoint haunts a card. Push too far and one can be lost — a week to rescue or ransom it.",
  },
  rescue: {
    key: "rescue", label: "Rescue", durationHours: 12, minShine: 8, minFoils: 0, minSigned: 0,
    forks: 1, risk: "lost", fee: 0, fragments: 0, target: "lost",
    what: "Send a squad after a lost card. Shine decides the odds. Fail and the rescuers come home wounded — and one of them can be lost too.",
  },
  exorcism: {
    key: "exorcism", label: "Exorcism", durationHours: 8, minShine: 0, minFoils: 0, minSigned: 0,
    forks: 0, risk: "none", fee: 400, fragments: 0, target: "afflicted",
    what: "A fee, no loot, no forks. Removes Haunted or Cursed from one card in the squad, for good.",
  },
  legendary: {
    key: "legendary", label: "Legendary route", durationHours: 72, minShine: 24, minFoils: 2, minSigned: 1,
    forks: 4, risk: "dead", fee: 0, fragments: 3, target: "none",
    what: "Three map fragments open it. Every fork is dangerous, a card can die for good, and whoever comes home comes home Voidtouched.",
  },
};

/** The ladder in the order the board prints it. */
export const TIER_ORDER: ExpeditionTierKey[] = ["scout", "raid", "legend", "rescue", "exorcism", "legendary"];

/** Risk, worst last — what "a route past wounded" means. */
export const RISK_RANK: Record<RouteRisk, number> = { none: 0, wounded: 1, lost: 2, dead: 3 };

/** How long a wounded card sits out expeditions and the Gauntlet. */
export const WOUNDED_HOURS = 72;

/** How long a lost card can be rescued or ransomed before it is gone. */
export const LOST_DAYS = 7;

/** Insurance: a launch-time fee that turns lost into wounded and dead into
 *  lost. Patrons get one policy a week for nothing (see patron/perks.ts). */
export const INSURANCE_FEE = 150;

/** What buying a lost card back costs: a floor plus a share of its shine,
 *  so a signed Cracked Ice challenger (16 shine) ransoms for 940 and a
 *  matte bronze for 340. Always dearer than the dust the card is worth,
 *  never dearer than a Legend Hunt jackpot. */
export const RANSOM_BASE = 300;
export const RANSOM_PER_SHINE = 40;

export function ransomFor(copy: CardCopy): number {
  return RANSOM_BASE + RANSOM_PER_SHINE * shineOf(copy);
}

/** Copies the economy already treats as one of one. They never go on a
 *  route that can lose them — Lost becomes Dead after LOST_DAYS, so the
 *  line is drawn at `lost`, not at `dead`. */
export function isProtected(copy: CardCopy): boolean {
  return (
    copy.foilType === "eclipse" || Boolean(copy.card?.moment) || Boolean(copy.card?.champWin) || Boolean(copy.card?.team)
  );
}

/** When a copy is benched, or null. `now` is passed in (the file has no
 *  clock): a card wounded until 4pm is free at 4pm on every caller's
 *  reading, not on whichever module loaded first. */
export function woundedUntil(copy: Pick<CardCopy, "card">, now: Date): Date | null {
  const until = copy.card?.wounded?.until;
  if (!until) return null;
  const at = new Date(until);
  return Number.isNaN(at.getTime()) || at.getTime() <= now.getTime() ? null : at;
}

/** Marks worst to best — a profile shows the best one earned, so this is
 *  the comparison every "did that run upgrade my mark?" check makes. */
export const MARK_RANK: Record<ExpeditionMark, number> = { trail: 1, sigil: 2, legend: 3 };

/** How many cards a squad takes. Three is the whole shape of the feature:
 *  enough that the gates bite, few enough that a modest collection can
 *  field one. */
export const SQUAD_SIZE = 3;

/**
 * The card tiers, worst to best. Mirrors `TIERS` in
 * src/lib/cards/build.ts:219 — that table maps score bands to tier keys and
 * is not exported, so this restates the ORDER only. Keep the two in the
 * same sequence: a tier added there and not here scores as the bottom of
 * the ladder rather than crashing a collection, the same forgiving read
 * dustValueOf takes on an unrecognized tier.
 */
const TIER_LADDER = ["bronze", "silver", "gold", "platinum", "emerald", "diamond", "master", "challenger"] as const;

/**
 * What each parallel adds to a copy's shine. Same quiet-to-loud order
 * FOIL_TYPE_WEIGHTS rolls (packs/config.ts) and deliberately flat-ish:
 * Cracked Ice is twenty times rarer than a Prisma but worth four shine to
 * a Prisma's one, because the gates already ask for foils by COUNT and a
 * rarity-true bonus would let one lucky card carry a squad past a tier it
 * has no business running.
 */
const FOIL_SHINE: Record<FoilType, number> = {
  prisma: 1, aurora: 2, refractor: 3, ice: 4,
  // A 1/1 is not a squad-building input. Pinned to the top of the ladder
  // rather than above it: nothing should make sending the rarest card in
  // the game out on an expedition the CORRECT play.
  eclipse: 4,
};

/** What an autograph adds. Equal to the top parallel: real ink is the
 *  rarest print there is (SIGNED_CHANCE, 1%), and pinning it to Cracked
 *  Ice means a signed bronze and a foil challenger both read as "a card
 *  worth sending". */
const SIGNED_SHINE = 4;

/** What a champions relic or a pulled moment is worth. Flat, because
 *  neither has a real tier to index — the placeholder they carry would
 *  otherwise score them as an ordinary card of that band. Six lands them
 *  at Diamond: above anything an average pull produces, under a maxed
 *  challenger print. */
const RELIC_SHINE = 6;

/**
 * How much shine one copy brings. Tier is the floor (ladder index + 1, so
 * bronze 1 through challenger 8) and the cosmetics stack on top, so a
 * signed Cracked Ice challenger tops out at 16 and a matte bronze is 1.
 */
export function shineOf(copy: CardCopy): number {
  // Relics and moments price flat, exactly as they dust flat — see
  // dustValueOf in packs/config.ts for the same branch.
  if (copy.card?.champWin || copy.card?.moment || copy.card?.team) return RELIC_SHINE;
  const index = TIER_LADDER.indexOf(copy.tier as (typeof TIER_LADDER)[number]);
  let shine = (index < 0 ? 0 : index) + 1;
  // foilTypeOf() rather than a raw read: foil_type is plain text and every
  // foil minted before parallels existed is a Prisma.
  if (copy.foil) shine += FOIL_SHINE[foilTypeOf(copy.foilType)];
  if (copy.signed) shine += SIGNED_SHINE;
  return shine;
}

/** A squad's total shine — what the tier gates and the payout bonus read. */
export function squadShine(copies: CardCopy[]): number {
  return copies.reduce((sum, copy) => sum + shineOf(copy), 0);
}

/**
 * Whether a squad may run a tier, and every reason it may not — all of
 * them, not the first, so the launcher can say what a squad is short of in
 * one pass instead of one swap at a time.
 *
 * Presentation reads this to disable a button; the RPC re-checks it
 * server-side, because a UI flag has never stopped anybody.
 */
export function squadMeets(
  tier: ExpeditionTierKey,
  copies: CardCopy[],
  /** The clock, for the wounded bench. Omit it and benched cards pass —
   *  the server always passes it; a preview may not care. */
  now?: Date,
): { ok: boolean; reasons: string[] } {
  const def = EXPEDITION_TIERS[tier];
  const reasons: string[] = [];

  // Consent, always: nothing one of one goes where it can be lost. Named
  // per card so the launcher says WHICH card is the problem.
  if (RISK_RANK[def.risk] >= RISK_RANK.lost) {
    for (const copy of copies) {
      if (isProtected(copy)) reasons.push(`${copy.playerName} is one of one and cannot go on a route where a card can be lost.`);
    }
  }
  if (now) {
    for (const copy of copies) {
      const until = woundedUntil(copy, now);
      if (until) reasons.push(`${copy.playerName} is wounded and benched until ${until.toLocaleString("en-US", { month: "short", day: "numeric", hour: "numeric", timeZone: "America/New_York" })} ET.`);
    }
  }

  if (copies.length !== SQUAD_SIZE) {
    reasons.push(`An expedition takes exactly ${SQUAD_SIZE} cards — this squad has ${copies.length}.`);
    // No early return: a two-card squad should also hear that it has no
    // foil in it, so the player fixes both in one go.
  }

  const foils = copies.filter((copy) => copy.foil).length;
  if (foils < def.minFoils) {
    reasons.push(`${def.label} needs ${def.minFoils} foil card${def.minFoils === 1 ? "" : "s"} — this squad has ${foils}.`);
  }

  const signed = copies.filter((copy) => copy.signed).length;
  if (signed < def.minSigned) {
    reasons.push(`${def.label} needs ${def.minSigned} signed card${def.minSigned === 1 ? "" : "s"} — this squad has ${signed}.`);
  }

  const shine = squadShine(copies);
  if (shine < def.minShine) {
    reasons.push(`${def.label} needs ${def.minShine} shine — this squad has ${shine}.`);
  }

  return { ok: reasons.length === 0, reasons };
}

/** The day's assignment: field this role and the payout pays more. */
export interface DailyBrief {
  key: string;
  label: string;
  /** The role word as it is PRINTED on cards ("Jungle"), which is what
   *  card_inventory.role stores — see CHASE_ROLES in packs/chase.ts and
   *  ROLE_LABELS in cards/build.ts. Matched case-insensitively anyway. */
  role: string;
  /** Fraction added to the day's dollars when the squad fields the role. */
  bonus: number;
}

/** What fielding the day's role is worth. Twenty percent is a reason to
 *  swap one card, never a reason to hold a run back for a better day. */
export const BRIEF_BONUS = 0.2;

/**
 * One brief per role the league actually prints.
 *
 * The plan called for six entries; a card carries one of five role words
 * (Top, Jungle, Mid, Bot, Support — CHASE_ROLES in packs/chase.ts, from
 * ROLE_LABELS in cards/build.ts), and a sixth naming anything else would
 * be an assignment no squad could ever satisfy. So the table is
 * one-per-role and no more.
 */
const BRIEFS: DailyBrief[] = [
  { key: "top", label: "Hold the top side", role: "Top", bonus: BRIEF_BONUS },
  { key: "jungle", label: "Track the jungle", role: "Jungle", bonus: BRIEF_BONUS },
  { key: "mid", label: "Own the middle", role: "Mid", bonus: BRIEF_BONUS },
  { key: "bot", label: "Escort the carry", role: "Bot", bonus: BRIEF_BONUS },
  { key: "support", label: "Bring a warden", role: "Support", bonus: BRIEF_BONUS },
];

/**
 * The brief for an EASTERN date ("2026-08-27"), the same for everyone all
 * day. Every caller passes an ET day and must keep doing so: the page
 * banner reads `easternDateOf(now)`, and the claim scores the run against
 * `easternDateOf(startedAt)` — the launch day on the same calendar the
 * daily limit uses (`launch_expedition`'s `now() at time zone
 * 'America/New_York'`). Feeding this a UTC date would put the banner and
 * the payout on different briefs for four hours a night.
 *
 * A char-code hash rather than a stored table or a shuffle: the brief has
 * to be recomputable from the date alone, both when a run launches and
 * when it is claimed hours later, and anything with state could disagree
 * with itself across those two moments. Consecutive dates land on
 * different entries because the day digits move the sum.
 */
export function briefFor(dateIso: string): DailyBrief {
  let hash = 0;
  for (let i = 0; i < dateIso.length; i += 1) hash += dateIso.charCodeAt(i);
  return BRIEFS[hash % BRIEFS.length];
}

export interface ExpeditionOutcome {
  grade: OutcomeGrade;
  /** Betting dollars, whole — the ledger has no cents. */
  dollars: number;
  /** A free pack, credited as a comp. */
  comp: boolean;
  /** The cosmetic mark, when one dropped. */
  mark: ExpeditionMark | null;
  /** Whether the squad satisfied the day's brief. */
  briefHit: boolean;
}

/** The grades in roll order — poor first, so the TOP of the range is the
 *  jackpot and a rand pinned high is always the best outcome. */
const GRADES: OutcomeGrade[] = ["poor", "solid", "jackpot"];

interface TierRewards {
  /** Relative weights per grade; they sum to 1 here, but the roll
   *  normalizes, so they don't have to. */
  weights: Record<OutcomeGrade, number>;
  /** Base dollars per grade, before shine and brief. */
  dollars: Record<OutcomeGrade, number>;
  /** Chance of a pack comp per grade. */
  comp: Record<OutcomeGrade, number>;
  /** The mark this tier can drop, and the chance per grade. A tier never
   *  drops a mark above its own ceiling, which is what makes the Legend
   *  mark evidence of a Legend Hunt rather than of patience. */
  mark: { kind: ExpeditionMark; chance: Record<OutcomeGrade, number> };
}

/**
 * How many runs one person may LAUNCH in an Eastern day — the real ceiling
 * on this feature, and the thing the first pass of these tables missed.
 *
 * Restated from launch_expedition (20260901000001_card_expeditions.sql),
 * which counts today's rows under a wallet lock and raises `daily
 * expedition limit` past it. Patrons get two; see PATRON_DAILY_LAUNCHES.
 *
 * This is why the original arithmetic here was wrong. It priced a scouting
 * run as "three a day" because three eight-hour runs fit in a day — but
 * the RPC never let anyone launch the second one. Every tier was tuned
 * against income nobody could actually earn, and the top of the ladder
 * paid $257 for a two-day wait while /daily paid $250 for a click.
 */
export const DAILY_LAUNCHES = 1;
export const PATRON_DAILY_LAUNCHES = 2;

/**
 * The payout tables — the whole economy of the feature.
 *
 * GUARDRAIL: an expedition supplements the economy, it never replaces
 * playing. Cards are locked for the run, not spent, so a run is free money
 * over time, and with one launch a day the number that matters is what a
 * single squad earns per day against a maxed /daily streak
 * (MAXED_DAILY_STREAK, $550 — imported, not restated): the thing a player
 * can get for a click, no cards and no wait.
 *
 *   scout   8h: 0.50x40 + 0.45x100 + 0.05x250          = $77.50
 *               one launch a day                       → $77.50/day
 *   raid   24h: 0.35x120 + 0.50x260 + 0.15x600         = $262.00
 *               + comp 0.15x0.30 = 4.5% x $200 = $9.00 → $271.00/day
 *   legend 48h: 0.25x400 + 0.50x850 + 0.25x2000        = $1,025.00
 *               + comp (0.50x0.25 + 0.25x0.75)
 *                 = 31.25% x $200 = $62.50
 *               $1,087.50 over two days                → $543.75/day
 *
 * So the ladder now says something: a walk pays pocket money, a day out
 * pays about a base daily, and two days with a gated squad pays about what
 * a seven-day daily streak pays — in lumps, with a jackpot worth four of
 * them. Every line still lands under MAXED_DAILY_STREAK, which is the rule
 * to keep: past it, the correct play stops being to show up.
 *
 * The ceiling — a maxed squad (+50% shine) that also fields the brief
 * (+20%) — takes legend to ($1,025 x 1.8 + $62.50) / 2 = $953.75 a day,
 * and getting there needs three signed Cracked Ice challengers locked
 * permanently. Raise anything here and redo that arithmetic.
 */
const REWARDS: Record<ExpeditionTierKey, TierRewards> = {
  scout: {
    weights: { poor: 0.5, solid: 0.45, jackpot: 0.05 },
    dollars: { poor: 40, solid: 100, jackpot: 250 },
    // A scouting run never comps: it is the tier with no gate at all, and
    // free packs off an ungated run is the loop that prints money.
    comp: { poor: 0, solid: 0, jackpot: 0 },
    mark: { kind: "trail", chance: { poor: 0, solid: 0, jackpot: 0.08 } },
  },
  raid: {
    weights: { poor: 0.35, solid: 0.5, jackpot: 0.15 },
    dollars: { poor: 120, solid: 260, jackpot: 600 },
    comp: { poor: 0, solid: 0, jackpot: 0.3 },
    mark: { kind: "sigil", chance: { poor: 0, solid: 0.1, jackpot: 0.3 } },
  },
  legend: {
    weights: { poor: 0.25, solid: 0.5, jackpot: 0.25 },
    // The whole point of the tier: two days and a collection nobody can
    // fake, for a number worth telling the server about. A jackpot here is
    // four maxed dailies in one hit.
    dollars: { poor: 400, solid: 850, jackpot: 2000 },
    comp: { poor: 0, solid: 0.25, jackpot: 0.75 },
    // A legend jackpot ALWAYS marks. Fielding a Legend Hunt at all is the
    // rarest thing in the feature; a second roll on top would leave the
    // players who hit it with nothing to show for it.
    mark: { kind: "legend", chance: { poor: 0, solid: 0, jackpot: 1 } },
  },
  // A rescue is paid in the card that comes home, not in dollars: this is
  // a scouting run's money for a twelve-hour risk to three more cards.
  rescue: {
    weights: { poor: 0.5, solid: 0.45, jackpot: 0.05 },
    dollars: { poor: 30, solid: 80, jackpot: 200 },
    comp: { poor: 0, solid: 0, jackpot: 0 },
    mark: { kind: "trail", chance: { poor: 0, solid: 0, jackpot: 0 } },
  },
  // An exorcism costs a fee and pays nothing. The grade is rolled so the
  // ceremony has a sentence to say; every number is zero.
  exorcism: {
    weights: { poor: 0, solid: 1, jackpot: 0 },
    dollars: { poor: 0, solid: 0, jackpot: 0 },
    comp: { poor: 0, solid: 0, jackpot: 0 },
    mark: { kind: "trail", chance: { poor: 0, solid: 0, jackpot: 0 } },
  },
  // Three days, three fragments, and a card that may not come back. Base
  // rates land at $500 a day — under the streak, like the ladder — and the
  // forks are where the money is: every push on this route adds to the
  // multiplier and to the odds of a funeral.
  legendary: {
    weights: { poor: 0.25, solid: 0.5, jackpot: 0.25 },
    dollars: { poor: 600, solid: 1400, jackpot: 2500 },
    comp: { poor: 0.25, solid: 0.5, jackpot: 1 },
    mark: { kind: "legend", chance: { poor: 0, solid: 0.5, jackpot: 1 } },
  },
};

/** What a merchant met on the trail pays, flat, on top of the run's
 *  dollars (journal.ts rolls the meeting). Small on purpose: an encounter
 *  is a beat, not a payout. */
export const MERCHANT_DOLLARS = 75;

/** The most the forks can multiply a payout by. A Legendary route pushed
 *  at every fork with a one-roster squad would otherwise reach 3.4x; the
 *  cap keeps the ceiling the claim RPC guards at a number the economy can
 *  stomach, and it is derived into maxExpeditionPayout() below. */
export const LOOT_MULT_CAP = 2.5;

/**
 * What a tier pays at worst and at best, before shine and the brief — the
 * numbers the board prints so nobody has to run a tier to find out whether
 * it is worth the wait. Read off REWARDS rather than written out again,
 * because a payout table and a printed range that disagree is worse than
 * printing nothing.
 */
export function payoutRange(tier: ExpeditionTierKey): { min: number; max: number } {
  const { dollars } = REWARDS[tier];
  const all = GRADES.map((grade) => dollars[grade]);
  return { min: Math.min(...all), max: Math.max(...all) };
}

/**
 * The most any single expedition can ever pay, in betting dollars.
 *
 * The claim RPC guards p_dollars the way open_card_pack guards p_cost — a
 * caller may only write a number the config could actually produce. That
 * guard shipped as a flat 2,000, which was the legend jackpot's BASE, and
 * so refused every legend jackpot that carried any bonus at all: a squad
 * one point over the gate rolled 2,060 and the claim died with "payout out
 * of range". Because rollOutcome re-rolls on every attempt, a player who
 * retried was paid a lower grade instead — the rarest outcome in the
 * feature was the one outcome that could not be paid.
 *
 * So the ceiling is DERIVED here and the SQL is held to it by a test,
 * rather than being a second number that can drift from this one. The
 * forks multiply the base (routes.ts), so the cap on that multiplier is
 * part of the derivation.
 */
export function maxExpeditionPayout(): number {
  let most = 0;
  for (const tier of Object.keys(REWARDS) as ExpeditionTierKey[]) {
    for (const grade of GRADES) {
      most = Math.max(
        most,
        Math.round(REWARDS[tier].dollars[grade] * (1 + SHINE_BONUS_CAP) * (1 + BRIEF_BONUS) * LOOT_MULT_CAP),
      );
    }
  }
  // The merchant's flat is the one thing added after the multiplier.
  return most + MERCHANT_DOLLARS;
}

/** How much each point of shine ABOVE the tier's gate adds to the payout,
 *  and the cap it stops at. Measured against the gate so a Legend Hunt's
 *  mandatory 20 shine is not paid for twice; capped so the ceiling in the
 *  guardrail above stays true. */
const SHINE_BONUS_PER_POINT = 0.03;
export const SHINE_BONUS_CAP = 0.5;

/** A chance that isn't one. Zero and one are settled without touching the
 *  stream — see rollOutcome's note on consumption order. */
function decide(chance: number, rand: () => number): boolean {
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return rand() < chance;
}

/** Weighted grade draw, walking GRADES worst-first so a scripted 0 always
 *  yields poor and a scripted 0.999 always yields jackpot. Consumes
 *  exactly one rand. */
function rollGrade(tier: ExpeditionTierKey, rand: () => number): OutcomeGrade {
  const { weights } = REWARDS[tier];
  const total = GRADES.reduce((sum, grade) => sum + weights[grade], 0);
  let ticket = rand() * total;
  for (const grade of GRADES) {
    ticket -= weights[grade];
    if (ticket < 0) return grade;
  }
  // Only reachable if rand() returns exactly 1 (outside Math.random's range).
  return GRADES[GRADES.length - 1];
}

/**
 * What one finished expedition brings home.
 *
 * Rand consumption is grade → comp → mark, in that fixed order, and
 * CONDITIONAL: a step whose chance is 0 or 1 is settled without drawing —
 * exactly the discipline packs/rng.ts follows when it skips the parallel
 * roll on a non-foil pull. That is what keeps a scripted queue readable (a
 * scouting run that rolled poor costs exactly one value, because it has
 * neither a comp chance nor a mark chance to spend one on) and it means
 * tuning a chance to 0 never shifts the values a later step reads.
 *
 * `rand` is injected rather than reached for: the server action passes the
 * CSPRNG, tests pass a queue.
 */
export function rollOutcome(
  tier: ExpeditionTierKey,
  shine: number,
  copies: Pick<CardCopy, "role">[],
  dateIso: string,
  rand: () => number,
): ExpeditionOutcome {
  const def = EXPEDITION_TIERS[tier];
  const rewards = REWARDS[tier];

  const grade = rollGrade(tier, rand);
  const comp = decide(rewards.comp[grade], rand);
  const mark = decide(rewards.mark.chance[grade], rand) ? rewards.mark.kind : null;

  const brief = briefFor(dateIso);
  // Case-insensitive: the column stores the printed word ("Mid"), but a
  // caller reading role off somewhere else should not silently lose the
  // bonus over capitalization.
  const briefHit = copies.some((copy) => copy.role?.trim().toLowerCase() === brief.role.toLowerCase());

  const shineBonus = Math.min(SHINE_BONUS_CAP, SHINE_BONUS_PER_POINT * Math.max(0, shine - def.minShine));
  // Rounded because betting dollars are whole — an un-rounded payout would
  // drift the ledger, the same reason dustValueOf rounds.
  const dollars = Math.round(rewards.dollars[grade] * (1 + shineBonus) * (briefHit ? 1 + brief.bonus : 1));

  return { grade, dollars, comp, mark, briefHit };
}

/**
 * What one day of this tier is expected to pay, in betting dollars, with a
 * pack comp valued at PACK_COST — the guardrail comment on REWARDS as
 * arithmetic rather than prose, so a balance pass that pushes a number too
 * far turns a test red instead of quietly minting an income.
 *
 * Runs per day is bounded by DAILY_LAUNCHES, not only by duration. That
 * bound is the correction: the first version of this divided the day by
 * the run length alone and priced a scouting run at three a day, which the
 * RPC has never permitted. A tier longer than a day still contributes its
 * fraction (a 48h run is half a run a day), because one squad genuinely
 * does land every other day.
 *
 * Base rates only: no shine bonus, no brief bonus, and it assumes the
 * player relaunches the moment a run lands (the honest worst case for the
 * economy). A patron may launch PATRON_DAILY_LAUNCHES a day and so earns
 * up to double this — a perk priced deliberately, not an oversight.
 */
export function expectedDailyDollars(tier: ExpeditionTierKey): number {
  const { weights, dollars, comp } = REWARDS[tier];
  const total = GRADES.reduce((sum, grade) => sum + weights[grade], 0);
  const perRun = GRADES.reduce(
    (sum, grade) => sum + (weights[grade] / total) * (dollars[grade] + comp[grade] * PACK_COST),
    0,
  );
  const runsPerDay = Math.min(24 / EXPEDITION_TIERS[tier].durationHours, DAILY_LAUNCHES);
  return perRun * runsPerDay;
}
