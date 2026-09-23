// Base camp: what a collector builds between runs and keeps. Pure, like
// config.ts, so the page, the panel, the launch and the claim all read the
// same numbers — and so a client component can import it (nothing here
// reaches routes.ts, journal.ts or a database client).
//
// The camp itself is the server's (expedition_camps, in the base camp
// migration *_expedition_base_camp.sql), and so is every purchase:
// upgrade_expedition_camp prices the level it finds under the lock from
// expedition_camp_price and refuses any other price.
// CAMP_PRICES is the same table, for showing; camp.test.ts reads the newest
// migration declaring expedition_camp_price and holds the two equal.
//
// The slot ceiling predates the rest: the guardrail in config.test.ts had
// to price a second scouting slot before the camp existed, because a slot
// that sends more squads out a day is the one upgrade that touches
// runs-per-day, so its bound is held against MAXED_DAILY_STREAK.

import { fmtPoints } from "@/lib/betting/format";
import { CAMPAIGNS, type CampaignKey } from "./campaigns";
import { EXPEDITION_TIERS, INSURANCE_FEE, type ExpeditionTierKey } from "./config";

/** Extra Scouting Runs a camp can put in the field at once. One: two
 *  scouts out together pay 465 a day at base rates, and with a
 *  Speedrunner's shorter clock 531 — under the streak. A second extra slot
 *  would not be. The camp table must check `slots` to the same bound. */
export const CAMP_SLOTS_MAX = 1;

/** Map fragments one forged policy costs. */
export const FORGE_FRAGMENTS = 2;
/** Forged policies a forge holds at once (expedition_camps.forged_policies). */
export const FORGE_HOLD = 2;
/** Forged launches an Eastern week. The weekly insurance cap does not
 *  count them; this does, in launch_expedition's 14-argument wrapper. */
export const FORGED_PER_WEEK = 1;

/** What a camp builds. */
export type CampUpgrade = "slot" | "tent" | "forge" | "wall";
/** What a camp can be asked for: an upgrade, or a forged policy. */
export type CampPurchase = CampUpgrade | "policy";

/** The order the panel lists them in — the spec's table order. */
export const CAMP_UPGRADES: readonly CampUpgrade[] = ["slot", "tent", "forge", "wall"];

export interface CampPrice {
  dollars: number;
  fragments: number;
}

/**
 * THE price table, level by level: index 0 is level 1. A forged policy is
 * always "level 1" — it is spent, not built. Equal to expedition_camp_price
 * (camp.test.ts), which is what a purchase is actually charged.
 *
 * $5,300 and 3 fragments buys every level; a policy is 2 fragments more.
 */
export const CAMP_PRICES: Readonly<Record<CampPurchase, readonly CampPrice[]>> = {
  slot: [{ dollars: 1500, fragments: 1 }],
  tent: [
    { dollars: 600, fragments: 0 },
    { dollars: 1200, fragments: 1 },
  ],
  forge: [{ dollars: 800, fragments: 1 }],
  wall: [
    { dollars: 300, fragments: 0 },
    { dollars: 900, fragments: 0 },
  ],
  policy: [{ dollars: 0, fragments: FORGE_FRAGMENTS }],
};

/** A collector's camp. Every level 0 is "not built". */
export interface CampState {
  slots: number;
  tent: number;
  forge: number;
  wall: number;
  /** Forged policies held, 0..FORGE_HOLD. */
  forgedPolicies: number;
  /** Dollars the camp has cost, all told. */
  spent: number;
}

/** A collector who has bought nothing yet: the camp every wallet starts with. */
export const EMPTY_CAMP: CampState = { slots: 0, tent: 0, forge: 0, wall: 0, forgedPolicies: 0, spent: 0 };

/** The top level of an upgrade: how many levels have a price. */
export function maxLevel(upgrade: CampUpgrade): number {
  return CAMP_PRICES[upgrade].length;
}

/** The level an upgrade stands at. */
export function levelOf(camp: CampState, upgrade: CampUpgrade): number {
  return upgrade === "slot" ? camp.slots : upgrade === "tent" ? camp.tent : upgrade === "forge" ? camp.forge : camp.wall;
}

/** The level a purchase of `upgrade` would build, or null at the top. */
export function nextLevel(camp: CampState, upgrade: CampUpgrade): number | null {
  const next = levelOf(camp, upgrade) + 1;
  return next <= maxLevel(upgrade) ? next : null;
}

/** The price of one level of a purchase, or null past the top. */
export function priceOf(purchase: CampPurchase, level: number): CampPrice | null {
  return CAMP_PRICES[purchase][level - 1] ?? null;
}

/** A clamp to the table's own checks, so a row that somehow disagreed
 *  with them can never show a level the database would refuse. */
function level(value: unknown, max: number): number {
  const n = Math.floor(Number(value));
  return Number.isFinite(n) ? Math.max(0, Math.min(max, n)) : 0;
}

/** An expedition_camps row (or upgrade_expedition_camp's return) → a
 *  CampState. No row is a camp with nothing built. */
export function campFromRow(row: Record<string, unknown> | null | undefined): CampState {
  if (!row || typeof row !== "object") return { ...EMPTY_CAMP };
  const spent = Math.floor(Number(row.spent ?? 0));
  return {
    slots: level(row.slots, CAMP_SLOTS_MAX),
    tent: level(row.tent, maxLevel("tent")),
    forge: level(row.forge, maxLevel("forge")),
    wall: level(row.wall, maxLevel("wall")),
    forgedPolicies: level(row.forged_policies ?? row.forgedPolicies, FORGE_HOLD),
    spent: Number.isFinite(spent) && spent > 0 ? spent : 0,
  };
}

/** Scouting Runs this camp can have out at once. Every other route is one
 *  at a time, camp or no camp — launch_expedition's tier slot. */
export function scoutSlots(camp: CampState | null): number {
  return 1 + (camp ? Math.max(0, Math.min(CAMP_SLOTS_MAX, camp.slots)) : 0);
}

/** Runs of `tier` this camp can have out at once. */
export function tierSlots(camp: CampState | null, tier: ExpeditionTierKey): number {
  return tier === "scout" ? scoutSlots(camp) : 1;
}

/** Whether the tent covers a harm: the first camp-side wound or haunting
 *  from level 1, the first toll from level 2. routes.ts applies it at the
 *  claim, under the edge rulebook only; this is the reading for the page. */
export function campCovers(camp: CampState | null, kind: "camp" | "toll"): boolean {
  const tent = camp?.tent ?? 0;
  return kind === "camp" ? tent >= 1 : tent >= 2;
}

const fragmentWords = (n: number) => `${n} map fragment${n === 1 ? "" : "s"}`;

/** "$1,500 + 1 map fragment", "$600", "2 map fragments". */
export function priceLine(price: CampPrice): string {
  const parts: string[] = [];
  if (price.dollars > 0) parts.push(fmtPoints(price.dollars));
  if (price.fragments > 0) parts.push(fragmentWords(price.fragments));
  return parts.length > 0 ? parts.join(" + ") : "free";
}

/** One level of an upgrade, in the player's words: what it is in plain
 *  words, the game's name for it second, and what it does. */
export interface CampLevelCopy {
  title: string;
  term: string;
  does: string;
}

/** What each level does. Index 0 is level 1. Every number is imported. */
export const CAMP_LINES: Readonly<Record<CampUpgrade, readonly CampLevelCopy[]>> = {
  slot: [
    {
      title: "A second scouting squad",
      term: "Squad slot",
      does: "Send two Scouting Runs at once. Scouting Runs only: every other route still takes one squad at a time.",
    },
  ],
  tent: [
    {
      title: "A tent",
      term: "Tent",
      does: "The first time a night at camp would wound a card or leave it Haunted, the tent takes it instead. Once a run, on every run that comes home after you pitch it.",
    },
    {
      title: "A bigger tent",
      term: "Tent, level 2",
      does: "Also pays the first toll on the road, so that toll takes nothing from the loot.",
    },
  ],
  forge: [
    {
      title: "A forge",
      term: "Forge",
      does: `Turn ${fragmentWords(FORGE_FRAGMENTS)} into a free insurance policy (a forged policy). Hold up to ${FORGE_HOLD}.`,
    },
  ],
  wall: [
    {
      title: "A trophy wall",
      term: "Trophy wall",
      does: "Hang your campaign relics, season marks, the landmarks you named and the roads you finished, here in your camp.",
    },
    {
      title: "A plaque",
      term: "Trophy wall, level 2",
      does: "Landmarks you named carry your crest on everyone's map and in the atlas.",
    },
  ],
};

/** The forge's one product, in the same words. */
export const POLICY_LINE: CampLevelCopy = {
  title: "Forge a policy",
  term: "Forged policy",
  does: `${fragmentWords(FORGE_FRAGMENTS)} make one free insurance policy. It skips the ${fmtPoints(INSURANCE_FEE)} fee and leaves your policy for the week unused; ${FORGED_PER_WEEK === 1 ? "one forged launch" : `${FORGED_PER_WEEK} forged launches`} a week. Insured, a card that would be lost comes home wounded, and one that would die comes home lost.`,
};

/** The copy for one level of an upgrade (clamped to the table). */
export function campLine(upgrade: CampUpgrade, lvl: number): CampLevelCopy {
  const lines = CAMP_LINES[upgrade];
  return lines[Math.max(0, Math.min(lines.length - 1, lvl - 1))];
}

/** What a purchase would buy next and for how much, or null when nothing
 *  can be bought (the top level; a forge not built, or full). */
export function nextPurchase(camp: CampState, purchase: CampPurchase): { level: number; price: CampPrice } | null {
  if (purchase === "policy") {
    if (camp.forge < 1 || camp.forgedPolicies >= FORGE_HOLD) return null;
    return { level: 1, price: CAMP_PRICES.policy[0] };
  }
  const next = nextLevel(camp, purchase);
  if (next === null) return null;
  const price = priceOf(purchase, next);
  return price ? { level: next, price } : null;
}

/**
 * Every reason a purchase cannot be made right now, in visible words —
 * the panel prints them beside the disabled button. Empty when it can.
 * The RPC is the rule (it re-checks all of it under the lock); this is
 * the sentence before the click.
 */
export function purchaseBlocks(
  camp: CampState,
  purchase: CampPurchase,
  wallet: { balance: number; fragments: number },
): string[] {
  if (purchase === "policy") {
    if (camp.forge < 1) return ["Build the forge first."];
    if (camp.forgedPolicies >= FORGE_HOLD) return [`You're holding ${FORGE_HOLD} forged policies, the most a forge holds. Use one on a launch first.`];
  } else if (nextLevel(camp, purchase) === null) {
    return ["Built to the top level."];
  }
  const next = nextPurchase(camp, purchase);
  if (!next) return [];
  const reasons: string[] = [];
  if (wallet.balance < next.price.dollars) {
    reasons.push(`You have ${fmtPoints(Math.max(0, wallet.balance))}; this costs ${fmtPoints(next.price.dollars)}.`);
  }
  if (wallet.fragments < next.price.fragments) {
    reasons.push(`You have ${fragmentWords(Math.max(0, wallet.fragments))}; this needs ${next.price.fragments}.`);
  }
  return reasons;
}

/** The forged-policy option on a route card. */
export interface ForgedPolicyState {
  held: number;
  /** Null when it can be used on this launch; otherwise why not, in words. */
  reason: string | null;
}

/**
 * Whether the route card offers "Use a forged policy", and if so whether
 * it can be ticked. Null hides the option: no camp (the feature is not
 * here, or nothing is forged), no policy held, or a route that cannot hurt
 * a card (a Scouting Run, an Exorcism — launch_expedition refuses those
 * with 'policy not wanted'). `forgedThisWeek` null means the count could
 * not be read: the option stays offered and the RPC decides.
 */
export function forgedPolicyState(
  camp: CampState | null,
  forgedThisWeek: number | null,
  tier: ExpeditionTierKey,
): ForgedPolicyState | null {
  if (!camp || camp.forgedPolicies < 1) return null;
  if (EXPEDITION_TIERS[tier].risk === "none") return null;
  const spent = forgedThisWeek !== null && forgedThisWeek >= FORGED_PER_WEEK;
  return {
    held: camp.forgedPolicies,
    reason: spent ? "This week's forged launch is used. The next one can go out Monday (Eastern)." : null,
  };
}

/**
 * A camp purchase's refusal, in the player's words, or null when the
 * message is not one of the camp's (the caller falls back to
 * friendlyExpeditionError). The fragment and balance words are the
 * camp's own: on a launch the same exceptions mean the Legendary route's
 * fragments and the tier's fee.
 */
export function friendlyCampError(message: string): string | null {
  if (/bad price/i.test(message)) return "The price changed while you were looking. Refresh your camp and try again.";
  if (/already built/i.test(message)) return "That's already built to the top level.";
  if (/forge not built/i.test(message)) return "Build the forge first.";
  if (/forge is full/i.test(message)) return `You're holding ${FORGE_HOLD} forged policies, the most a forge holds. Use one first.`;
  if (/unknown upgrade/i.test(message)) return "Your camp can't build that.";
  if (/not enough fragments/i.test(message)) return "You don't have enough map fragments for that.";
  if (/insufficient balance/i.test(message)) return "You can't cover that price.";
  return null;
}

// === the wall ================================================================

/** A campaign relic on the wall. */
export interface WallRelic {
  id: number;
  name: string;
  campaign: string;
}

/** A landmark the collector named first (the atlas, Phase 6). */
export interface WallLandmark {
  key: string;
  title: string;
}

/** A road the collector walked end to end (the atlas, Phase 6). */
export interface WallRoad {
  tier: ExpeditionTierKey;
}

/** The relics on a shelf: every copy a campaign finale printed. */
export function wallRelics(
  copies: readonly { id: number; playerName?: string; card?: { name?: string; campaign?: { key: CampaignKey } | null } | null }[],
): WallRelic[] {
  const relics: WallRelic[] = [];
  for (const copy of copies) {
    const key = copy.card?.campaign?.key;
    if (!key || !CAMPAIGNS[key]) continue;
    relics.push({ id: copy.id, name: copy.card?.name ?? copy.playerName ?? "A relic", campaign: CAMPAIGNS[key].label });
  }
  return relics;
}
