// What the board can say about a route before anyone presses anything, and
// the squad it would suggest.
//
// Pure, over the same gates the launch checks (`squadMeets`, `shineOf`,
// `abilitySheet`), so a suggestion never proposes a squad the action would
// refuse, and a route pill never calls a route open that the card below it
// calls shut. Presentation only: launch_expedition re-checks everything
// under a row lock.

import { abilitySheet } from "./archetypes";
import {
  EXPEDITION_TIERS,
  RISK_RANK,
  SQUAD_SIZE,
  expectedDailyDollars,
  isProtected,
  shineOf,
  squadMeets,
  woundedUntil,
  type CardCopy,
  type ExpeditionTierKey,
} from "./config";

/** What the board knows beyond the squad: the route slots in the field,
 *  the fragments and marks the shelf holds, whether anything is lost. */
export interface RouteContext {
  now: Date;
  fragments: number;
  patron: boolean;
  legendMark: boolean;
  /** Routes with every slot in the field: one run of each at a time, two
   *  Scouting Runs once the base camp has its squad slot (tierSlots). */
  tiersOut: ReadonlySet<string>;
  /** Cards lost right now; a Rescue needs one to go after. */
  lostCards: number;
}

/** idle: no full squad yet, nothing else in the way. ready: this squad can
 *  go. locked: something says no. out: this route already has a run in
 *  the field. */
export type RouteState = "idle" | "ready" | "locked" | "out";

export interface RouteGate {
  tier: ExpeditionTierKey;
  state: RouteState;
  ok: boolean;
  /** The reasons that are about the board, not the squad, each named so
   *  the route card can print it where it has always printed it. */
  context: {
    out: boolean;
    patron: boolean;
    fragments: boolean;
    noHold: boolean;
    afflicted: boolean;
    legendMark: boolean;
  };
  /** `squadMeets`' reasons, verbatim — the board never restates a gate in
   *  its own words, or the two drift. */
  squad: string[];
  /** Two or three words for the route pill, or null when there is nothing
   *  to refuse yet. */
  short: string | null;
}

const isAfflicted = (copy: CardCopy) => copy.card?.mutation?.key === "haunted" || copy.card?.mutation?.key === "cursed";
const isVoidtouched = (copy: CardCopy) => copy.card?.mutation?.key === "voidtouched";

/** A count in the pill's words: "a foil", "2 foils". */
function some(n: number, one: string, many: string): string {
  return n === 1 ? one : `${n} ${many}`;
}

/** Whether a squad can run a route, why not, and what the pill says. */
export function routeGate(tier: ExpeditionTierKey, squad: CardCopy[], ctx: RouteContext): RouteGate {
  const def = EXPEDITION_TIERS[tier];
  const full = squad.length === SQUAD_SIZE;
  const context = {
    out: ctx.tiersOut.has(tier),
    patron: def.patron && !ctx.patron,
    fragments: def.fragments > ctx.fragments,
    noHold: def.target === "lost" && ctx.lostCards === 0,
    afflicted: def.target === "afflicted" && full && !squad.some(isAfflicted),
    legendMark: tier === "mythic" && !ctx.legendMark,
  };
  const meets = squadMeets(tier, squad, ctx.now, { legendMark: ctx.legendMark });
  const blockedByBoard = context.out || context.patron || context.fragments || context.noHold || context.legendMark;

  let short: string | null = null;
  if (context.out) short = "out now";
  else if (context.patron) short = "patrons only";
  else if (context.fragments) short = `${def.fragments} fragments`;
  else if (context.noHold) short = "nothing lost";
  else if (context.legendMark) short = "Legend mark";
  else if (full && (!meets.ok || context.afflicted)) {
    const foils = squad.filter((copy) => copy.foil).length;
    const signed = squad.filter((copy) => copy.signed).length;
    const power = squad.reduce((sum, copy) => sum + shineOf(copy), 0);
    if (RISK_RANK[def.risk] >= RISK_RANK.lost && squad.some(isProtected)) short = "relic aboard";
    else if (squad.some((copy) => woundedUntil(copy, ctx.now))) short = "wounded card";
    else if (tier === "mythic" && !squad.some(isVoidtouched)) short = "needs Voidtouched";
    else if (context.afflicted) short = "needs Haunted";
    else if (power < def.minShine) short = `needs ${def.minShine} power`;
    else if (foils < def.minFoils) short = `needs ${some(def.minFoils, "a foil", "foils")}`;
    else if (signed < def.minSigned) short = `needs ${def.minSigned} signed`;
  }

  const ok = full && meets.ok && !blockedByBoard && !context.afflicted;
  const state: RouteState = context.out ? "out" : ok ? "ready" : blockedByBoard || full ? "locked" : "idle";
  return { tier, state, ok, context, squad: meets.reasons, short };
}

/** Whether something other than the squad shuts this route: a run already
 *  out on it, the patrons' road, fragments, nothing lost, the Legend mark. */
export function boardBlocked(gate: RouteGate): boolean {
  const { out, patron, fragments, noHold, legendMark } = gate.context;
  return out || patron || fragments || noHold || legendMark;
}

/** The route to show when nothing better is known: the first in `order`
 *  the board is not already refusing, so the card under the row opens on a
 *  route this collector could run with the right three cards rather than
 *  on "already in the field". */
export function firstOpenRoute(gates: Record<ExpeditionTierKey, RouteGate>, order: ExpeditionTierKey[]): ExpeditionTierKey {
  return order.find((tier) => !boardBlocked(gates[tier])) ?? order[0];
}

/** The routes a suggestion may choose, best-paying first. Rescue and
 *  Exorcism are errands the collector starts on purpose, and the two
 *  routes where a card can die are never a default: the player picks
 *  those with the consent line in front of them. */
export const SUGGESTED_ROUTES: ExpeditionTierKey[] = (["scout", "raid", "legend", "gilded"] as ExpeditionTierKey[]).sort(
  (a, b) => expectedDailyDollars(b) - expectedDailyDollars(a),
);

/** The best-paying route this squad can run right now, or null. */
export function bestRoute(squad: CardCopy[], ctx: RouteContext): ExpeditionTierKey | null {
  return SUGGESTED_ROUTES.find((tier) => routeGate(tier, squad, ctx).ok) ?? null;
}

/** Cards that can be picked at all: home, not lost, not sealed in a slab,
 *  not on the wounded bench. */
export function freeCopies(
  copies: CardCopy[],
  { deployedIds, lostIds, now }: { deployedIds: ReadonlySet<number>; lostIds: ReadonlySet<number>; now: Date },
): CardCopy[] {
  return copies.filter(
    (copy) => !deployedIds.has(copy.id) && !lostIds.has(copy.id) && !copy.card?.slab && woundedUntil(copy, now) === null,
  );
}

/** Strongest first; the lower id breaks a tie so a suggestion is stable. */
function byPower(a: CardCopy, b: CardCopy): number {
  return shineOf(b) - shineOf(a) || a.id - b.id;
}

/** The cards a route may take: nothing protected goes where a card can
 *  be lost. */
function eligible(free: CardCopy[], tier: ExpeditionTierKey): CardCopy[] {
  const risky = RISK_RANK[EXPEDITION_TIERS[tier].risk] >= RISK_RANK.lost;
  return free.filter((copy) => !(risky && isProtected(copy))).sort(byPower);
}

/** The strongest squad that clears a route's gates: its Voidtouched card,
 *  its signatures and its foils first, then the most power. */
function squadFor(tier: ExpeditionTierKey, free: CardCopy[], ctx: RouteContext): CardCopy[] | null {
  const def = EXPEDITION_TIERS[tier];
  const pool = eligible(free, tier);
  const picked: CardCopy[] = [];
  const take = (wanted: (copy: CardCopy) => boolean): boolean => {
    const next = pool.find((copy) => !picked.includes(copy) && wanted(copy));
    if (next) picked.push(next);
    return Boolean(next);
  };
  if (tier === "mythic") take(isVoidtouched);
  while (picked.filter((copy) => copy.signed).length < def.minSigned && picked.length < SQUAD_SIZE && take((copy) => copy.signed));
  while (picked.filter((copy) => copy.foil).length < def.minFoils && picked.length < SQUAD_SIZE && take((copy) => copy.foil));
  while (picked.length < SQUAD_SIZE && take(() => true));
  return picked.length === SQUAD_SIZE && routeGate(tier, picked, ctx).ok ? picked : null;
}

/**
 * Squads of three different edge kinds that still clear `tier`, strongest
 * first — what "Suggest a squad" cycles through on its second press,
 * because three different kinds is the whole of squad building (one edge
 * of each kind counts). Searches the strongest two dozen eligible cards,
 * which is every combination a real shelf needs and a few thousand checks.
 */
export function cycleByEdges(free: CardCopy[], tier: ExpeditionTierKey, ctx: RouteContext, limit = 24): CardCopy[][] {
  const pool = eligible(free, tier).slice(0, limit);
  const found: { squad: CardCopy[]; power: number }[] = [];
  for (let i = 0; i < pool.length; i += 1) {
    for (let j = i + 1; j < pool.length; j += 1) {
      for (let k = j + 1; k < pool.length; k += 1) {
        const squad = [pool[i], pool[j], pool[k]];
        if (!abilitySheet(squad).every((entry) => entry.counts)) continue;
        if (!routeGate(tier, squad, ctx).ok) continue;
        found.push({ squad, power: squad.reduce((sum, copy) => sum + shineOf(copy), 0) });
      }
    }
  }
  return found.sort((a, b) => b.power - a.power).map((entry) => entry.squad);
}

export interface Suggestion {
  squad: CardCopy[];
  /** The route it was built for, or null when nothing the suggestion
   *  may choose is open (every suggested route out, say). */
  route: ExpeditionTierKey | null;
}

const idsOf = (squad: CardCopy[]) => squad.map((copy) => copy.id).sort((a, b) => a - b).join(",");

/**
 * The squad "Suggest a squad" picks. Press 0 is the strongest free three
 * that open the best-paying route the collector can run; every later
 * press cycles through squads of three different edge kinds on the same
 * route. Null when fewer than three cards are free.
 */
export function suggestSquad(free: CardCopy[], ctx: RouteContext, press = 0): Suggestion | null {
  if (free.length < SQUAD_SIZE) return null;
  let base: Suggestion | null = null;
  for (const tier of SUGGESTED_ROUTES) {
    const squad = squadFor(tier, free, ctx);
    if (squad) {
      base = { squad, route: tier };
      break;
    }
  }
  if (!base) {
    const squad = [...free].sort(byPower).slice(0, SQUAD_SIZE);
    base = { squad, route: bestRoute(squad, ctx) };
  }
  if (press === 0 || base.route === null) return base;
  const others = cycleByEdges(free, base.route, ctx).filter((squad) => idsOf(squad) !== idsOf(base.squad));
  if (others.length === 0) return base;
  // Press 1 is the best different-kinds squad, and the cycle comes back
  // round to the strongest squad after the last of them.
  const ring = [base.squad, ...others];
  return { squad: ring[press % ring.length], route: base.route };
}
