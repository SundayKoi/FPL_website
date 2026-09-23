// Edges: what a card's title does on the road.
//
// Every card is minted with a title (`card.archetype`, frozen from the pool
// in src/lib/cards/build.ts). From ARCHETYPE_RULES that title is an edge:
// a small, named way the card bends a run — a guard that softens harm, a
// rival edge that takes a cache, a clock that beats the storm. This file
// is the table and the stacking rule, nothing else. The resolver, the
// journal, the claim and the launch read it; none of them restates a
// number that lives here.
//
// The stacking rule is the whole of squad building: an edge has a KIND,
// and at most one edge of each kind counts in a squad — the higher power,
// then the card with more trail miles, then the lower inventory id. Three
// guards are one guard; a guard, a rival edge and a camp edge are three.
//
// Every figure lands inside a ceiling the economy already carries: the loot
// multiplier's LOOT_MULT_CAP, the fragment cap, a boolean comp, or the
// Harvest merchant price maxExpeditionPayout() already pays. The Speedrunner
// is the one edge that touches runs per day, which is why its cut stops at
// SPEEDRUN_MAX_HOURS (config.test.ts holds the arithmetic).
//
// Pure, like config.ts. Never imports routes.ts' values: routes.ts reads
// this table, and a table built at load time cannot wait on a cycle.

import { FALLBACK_ARCHETYPE } from "@/lib/cards/build";
import { HARVEST_MERCHANT, WOUNDED_HOURS, type CardCopy } from "./config";
import { milesOf } from "./trail";

/** The rulebook version from which a run walks with edges, can pitch the
 *  camp's tent, sees what an edge reveals ahead, and lets a Speedrunner
 *  beat the storm. A run stamped below it resolves exactly as it would
 *  have: its rolls, its journal and its events are untouched. */
export const ARCHETYPE_RULES = 6;

// === the figures ============================================================
// Named so the resolver and the sentence below quote the same number.

/** The three sizes a loot edge comes in, added to the multiplier. */
export const EDGE_SMALL = 0.05;
export const EDGE = 0.1;
export const EDGE_BIG = 0.15;
/** Momentum edges count consecutive pushes up to this many. */
export const STREAK_CAP = 3;
export const HEATER_STREAK = 0.05;
export const CONDUCTOR_STREAK = 0.03;
/** Tempo Conductor's hand on the Mythic route's death roll: it grows at
 *  this share of MOMENTUM_DEATH per push. */
export const CONDUCTOR_DEATH = 0.5;
/** The Speedrunner's clock: this many hours off a route no longer than
 *  SPEEDRUN_MAX_HOURS. A Legend Hunt an hour short would pay 555 a day at
 *  base rates, over the streak, so long routes get storm immunity instead. */
export const SPEEDRUN_HOURS = 1;
export const SPEEDRUN_MAX_HOURS = 24;
export const COINFLIP_SWING = 2;
export const FREE_WIN_LOSE = 0.1;
export const LIFELINE_RESCUE = 0.15;
/** The Lifeline's bench, in place of WOUNDED_HOURS. Well inside the eight
 *  days resolve_expedition accepts for a wound. */
export const LIFELINE_BENCH_HOURS = 48;
/** How many times the merchant is drawn into a leg's beats under First
 *  Blood Merchant. */
export const MERCHANT_DRAW = 2;
export const GANK_WIN_MULT = 2;
export const ISLAND_HOLD = 0.2;
/** How many holds Island King may call in a run. */
export const ISLAND_HOLDS = 2;
export const HYPERCARRY_LAST = 1.75;
export const LANE_BULLY_BONUS = 1.5;
/** How far over the route's shine gate a squad may be and still be The
 *  Underdog. */
export const UNDERDOG_MARGIN = 3;
export const POWER_FARMER_CAMP = 0.08;
export const PLATE_TOLL = 0.5;
export const HIGHLIGHT_REWARD = 1.5;
export const TURRET_FINDS = 2;
// Harm scales. A wound scale touches the wound roll; a deep scale touches
// the lost and dead rolls; a harm scale touches all three.
export const GLASS_CANNON_HARM = 1.5;
export const SURGEON_WOUND = 0.75;
export const CLUTCH_HARM = 0.5;
export const WEAKSIDE_HARM = 0.5;
export const JUGGERNAUT_WOUND = 0.75;
export const ASSASSIN_DEEP = 0.5;
export const POSITIONING_HARM = 0.25;
export const FRONTLINE_DEEP = 0.5;
export const SKIRMISH_HARM = 0.75;
export const WAVE_CAMP_WOUND = 0.5;
export const POKE_CAMP_WOUND = 0;
export const SPACE_HAUNT = 0.5;

// === the table ==============================================================

/** What an edge is, for the one-per-kind rule. A squad fields at most one
 *  counting edge of each. */
export type AbilityKind =
  | "loot" | "finale" | "guard" | "shield" | "front" | "camp" | "hold" | "toll" | "gamble" | "find" | "merchant"
  | "rival" | "ghost" | "warned" | "momentum" | "call" | "clock" | "reveal" | "mutation" | "rescue" | "jack";

export interface ArchetypeAbility {
  /** The title exactly as the card json carries it. */
  title: string;
  kind: AbilityKind;
  /** Which of two same-kind edges counts. Jack of All Trades is 0, so any
   *  real title outranks it. */
  power: number;
  /** The effect in one line, as the picker and the rules page print it. */
  does: string;
}

/** A count in words: the table says "twice a run", not "2 times". */
function times(n: number): string {
  return n === 1 ? "once" : n === 2 ? "twice" : `${n} times`;
}

const ABILITY_ROWS: ArchetypeAbility[] = [
  { title: "Pentakill Machine", kind: "loot", power: 3, does: `The first push of the run that harms nobody adds +${EDGE_BIG} more.` },
  { title: "On A Heater", kind: "momentum", power: 2, does: `Consecutive pushes carry on every route: +${HEATER_STREAK} × streak (cap ${STREAK_CAP}) to the push bonus. Mythic momentum stacks; its death roll unchanged.` },
  { title: "Glass Cannon", kind: "loot", power: 1, does: `Every push adds +${EDGE_SMALL}; harm rolls that land on this card are ×${GLASS_CANNON_HARM} (capped at 1).` },
  { title: "The Surgeon", kind: "guard", power: 2, does: `Wound rolls on the whole squad ×${SURGEON_WOUND}.` },
  { title: "Highlight Reel", kind: "mutation", power: 2, does: `Mutation chances at every push and every camp ×${HIGHLIGHT_REWARD}.` },
  { title: "Coinflip Gamer", kind: "gamble", power: 3, does: `A coin-flip fork swings ×${COINFLIP_SWING} both ways, the bonus and the loss. On a route with no coin flip the run's first push is a coin: heads pays its bonus ×${COINFLIP_SWING}, tails pays none; harm as normal.` },
  { title: "Born Winner", kind: "rival", power: 1, does: "A rival that beats the squad costs nothing." },
  { title: "Clutch Gene", kind: "finale", power: 2, does: `The last fork's push rolls its harm at ×${CLUTCH_HARM}.` },
  { title: "Speedrunner", kind: "clock", power: 2, does: `Routes of ≤ ${SPEEDRUN_MAX_HOURS}h resolve ${SPEEDRUN_HOURS} hour${SPEEDRUN_HOURS === 1 ? "" : "s"} sooner (a convoy guest keeps the host's clock). Storms never hold the squad on any route.` },
  { title: "The Anchor", kind: "shield", power: 1, does: "The first wound rolled on this card is ignored." },
  { title: "The Veteran", kind: "call", power: 1, does: "This card's own role call takes a Veteran's shape, whatever its miles." },
  { title: "The Underdog", kind: "finale", power: 1, does: `If the squad's shine is within ${UNDERDOG_MARGIN} of the route's gate, +${EDGE_BIG} at the finale.` },
  { title: "Ice In The Veins", kind: "warned", power: 2, does: "A warned fork's curse never sticks to this card (harm still counts)." },
  { title: "Farm Demon", kind: "camp", power: 1, does: `Every camp (not a hold) adds +${EDGE_SMALL}.` },
  { title: "Lane Bully", kind: "loot", power: 2, does: `The first fork's push bonus ×${LANE_BULLY_BONUS}.` },
  { title: "Gold Hoarder", kind: "merchant", power: 2, does: `The merchant pays Harvest prices (×${HARVEST_MERCHANT}) in any weather; never more.` },
  { title: "Plate Collector", kind: "toll", power: 1, does: `Tolls cost ×${PLATE_TOLL}.` },
  { title: "Wave Manager", kind: "camp", power: 1, does: `Camp wound rolls ×${WAVE_CAMP_WOUND}.` },
  { title: "Free Win Lane", kind: "gamble", power: 2, does: `A gamble's lose chance −${FREE_WIN_LOSE.toFixed(2)}; on a route without one, the first fork's camp carries no camp risk.` },
  { title: "Island King", kind: "hold", power: 2, does: `A hold pays +${ISLAND_HOLD} and may be called ${times(ISLAND_HOLDS)} a run.` },
  { title: "Split Pusher", kind: "front", power: 1, does: "Harm never lands on this card while another living card can take it." },
  { title: "Weakside Warrior", kind: "guard", power: 2, does: `Harm rolls on this card ×${WEAKSIDE_HARM}.` },
  { title: "Unkillable", kind: "shield", power: 3, does: "The first harm rolled on this card — wound, loss or death — is ignored." },
  { title: "The Juggernaut", kind: "front", power: 2, does: `Takes the hit for a squadmate; wound rolls on it ×${JUGGERNAUT_WOUND}.` },
  { title: "Jungle Diff", kind: "reveal", power: 2, does: "The next two checkpoints ahead are known." },
  { title: "Power Farmer", kind: "camp", power: 2, does: `Every camp (not a hold) adds +${POWER_FARMER_CAMP}.` },
  { title: "Gank Squad", kind: "rival", power: 2, does: `A rival beaten pays ×${GANK_WIN_MULT}.` },
  // The ghost's cache is a cache: EDGE_BIG is held equal to CACHE_LOOT by
  // the test, so the figure quoted here is the one the road pays.
  { title: "Counter Jungler", kind: "ghost", power: 2, does: `A ghost met leaves its cache whether or not it stood (+${EDGE_BIG}) and never doubles the haunting.` },
  { title: "Tempo Setter", kind: "clock", power: 1, does: "Storms never hold the squad." },
  { title: "Camp Thief", kind: "rival", power: 3, does: `Takes the rival's cache: every rival met, won or lost, adds +${EDGE_BIG} on top of the verdict.` },
  { title: "Tempo Conductor", kind: "momentum", power: 1, does: `+${CONDUCTOR_STREAK} × streak (cap ${STREAK_CAP}) everywhere; on the Mythic route the death roll grows at ×${CONDUCTOR_DEATH} the rate.` },
  { title: "Roaming Threat", kind: "call", power: 2, does: "The Mid's roam rolls its harm on one card, not two." },
  { title: "Priority Merchant", kind: "toll", power: 2, does: "Tolls are waived." },
  { title: "Burst Mage", kind: "loot", power: 2, does: `A push at a dark fork adds +${EDGE} more.` },
  { title: "The Assassin", kind: "guard", power: 2, does: `Lost and dead rolls on this card ×${ASSASSIN_DEEP}.` },
  { title: "The Hypercarry", kind: "finale", power: 3, does: `The last fork's push bonus ×${HYPERCARRY_LAST}.` },
  { title: "Positioning God", kind: "guard", power: 2, does: `Harm rolls on this card ×${POSITIONING_HARM}.` },
  { title: "Late Game Insurance", kind: "finale", power: 1, does: "A multiplier under 1 at the finale is raised to 1." },
  { title: "Turret Melter", kind: "find", power: 1, does: `Free-pack finds on a push ×${TURRET_FINDS}.` },
  { title: "Silent Carry", kind: "mutation", power: 1, does: "This card never comes home Haunted." },
  { title: "The Warden", kind: "reveal", power: 1, does: "Every checkpoint ahead shows its danger (warned, dark, toll); the next one is known." },
  { title: "The Bodyguard", kind: "front", power: 2, does: "Takes the hit for a squadmate; the first wound on it is ignored." },
  { title: "The Engage", kind: "loot", power: 2, does: `A push at a fork whose camp is not safe (camp risk or toll) adds +${EDGE}.` },
  { title: "The Lifeline", kind: "rescue", power: 2, does: `Rescue chance +${LIFELINE_RESCUE}; every wound this run benches ${LIFELINE_BENCH_HOURS}h, not ${WOUNDED_HOURS}h.` },
  { title: "Roam Enjoyer", kind: "find", power: 2, does: "Relic hunters always have a fragment." },
  { title: "Poke Support", kind: "camp", power: 2, does: `Camp wound rolls ×${POKE_CAMP_WOUND} (haunting unchanged).` },
  { title: "Vision Denier", kind: "ghost", power: 1, does: "A ghost never doubles the haunting, and a safe camp stays safe with one at its edge." },
  { title: "Sacrificial Play", kind: "front", power: 1, does: `Takes the hit for a squadmate; when it does, +${EDGE_BIG}.` },
  { title: "Playmaker", kind: "loot", power: 1, does: `Any role-call push adds +${EDGE_SMALL} more.` },
  { title: "The Enabler", kind: "loot", power: 1, does: `The first time another edge fires this run, +${EDGE_SMALL}.` },
  { title: "First Blood Merchant", kind: "merchant", power: 1, does: `The merchant is ${times(MERCHANT_DRAW)} as likely to be a leg's beat.` },
  { title: "The Frontline", kind: "front", power: 3, does: `Takes the hit for a squadmate; lost and dead rolls on it ×${FRONTLINE_DEEP}.` },
  { title: "Space Creator", kind: "camp", power: 2, does: `Haunting rolls at every camp ×${SPACE_HAUNT}.` },
  { title: "Duelist", kind: "warned", power: 1, does: `A push at a warned fork adds +${EDGE}.` },
  { title: "Executioner", kind: "loot", power: 2, does: `Every push that harms nobody adds +${EDGE_SMALL}.` },
  { title: "Skirmish King", kind: "warned", power: 2, does: `Harm at a warned fork ×${SKIRMISH_HARM} (whole squad).` },
  { title: FALLBACK_ARCHETYPE, kind: "jack", power: 0, does: `+${EDGE_SMALL} at the finale.` },
];

/** Every title's edge, keyed by the title, in the mint pool's order. */
export const ARCHETYPE_ABILITIES: Readonly<Record<string, ArchetypeAbility>> = Object.freeze(
  Object.fromEntries(ABILITY_ROWS.map((row) => [row.title, Object.freeze(row)])),
);

// A Map, not an index into the record: a frozen title of "constructor"
// must read as Jack of All Trades, not as Object's prototype.
const BY_TITLE = new Map(ABILITY_ROWS.map((row) => [row.title, row]));

/**
 * A copy's edge, read off the title its json was minted with. A title the
 * table does not know — retired from the pool, or never on the card, as on
 * an old relic — reads as Jack of All Trades, the pool's own fallback.
 */
export function abilityOf(copy: Pick<CardCopy, "card">): ArchetypeAbility {
  const title = typeof copy.card?.archetype === "string" ? copy.card.archetype.trim() : "";
  return BY_TITLE.get(title) ?? BY_TITLE.get(FALLBACK_ARCHETYPE)!;
}

// === the stacking rule ======================================================

/** One squad member's edge, and whether it counts. */
export interface ActiveAbility {
  copyId: number;
  ability: ArchetypeAbility;
  /** The edge its kind counts in this squad. */
  counts: boolean;
  /** When it does not count: the copy whose edge of the same kind does. */
  ignoredFor?: number;
}

type Contender = { copyId: number; ability: ArchetypeAbility; miles: number };

/** Power first, then trail miles (the card that has walked further leads),
 *  then the lower id, so the answer never depends on squad order. */
function outranks(a: Contender, b: Contender): boolean {
  if (a.ability.power !== b.ability.power) return a.ability.power > b.ability.power;
  if (a.miles !== b.miles) return a.miles > b.miles;
  return a.copyId < b.copyId;
}

/**
 * Every squad member's edge in squad order, with the one-per-kind rule
 * applied — what the picker prints, so a player sees which edges count and
 * which are ignored before the squad leaves.
 */
export function abilitySheet(copies: Pick<CardCopy, "id" | "card">[]): ActiveAbility[] {
  const contenders: Contender[] = copies.map((copy) => ({ copyId: copy.id, ability: abilityOf(copy), miles: milesOf(copy) }));
  const leader = new Map<AbilityKind, Contender>();
  for (const contender of contenders) {
    const best = leader.get(contender.ability.kind);
    if (!best || outranks(contender, best)) leader.set(contender.ability.kind, contender);
  }
  return contenders.map(({ copyId, ability }) => {
    const top = leader.get(ability.kind)!;
    return top.copyId === copyId ? { copyId, ability, counts: true } : { copyId, ability, counts: false, ignoredFor: top.copyId };
  });
}

/** Only the edges that count: what the road reads. */
export function activeAbilities(copies: Pick<CardCopy, "id" | "card">[]): ActiveAbility[] {
  return abilitySheet(copies).filter((entry) => entry.counts);
}

// === derivation-time traits =================================================

/** What the squad sees of the road ahead: nothing more than the rules give
 *  every run, the next checkpoint, the next two (Jungle Diff), or the next
 *  one plus every checkpoint's danger (The Warden). No edge gives `next`
 *  alone; it is on the scale because The Warden's reading includes it. */
export type AbilityReveal = "none" | "next" | "two" | "danger";

/**
 * The edges that change what the road IS rather than how a fork resolves:
 * the encounters drawn, the storm, the clock, the fog. The page, the sweep
 * and the claim each hold the squad, so each derives these for itself and
 * all three agree without a table.
 */
export interface AbilityTraits {
  /** Storms never hold the squad (Speedrunner, Tempo Setter). */
  stormproof: boolean;
  /** Every relic hunter met carries a fragment (Roam Enjoyer). */
  hunterFinds: boolean;
  /** The merchant is drawn MERCHANT_DRAW times into the beats (First
   *  Blood Merchant). */
  merchantDraw: boolean;
  reveal: AbilityReveal;
  /** The launch takes SPEEDRUN_HOURS off a short route (Speedrunner). */
  speedrun: boolean;
}

/**
 * The squad's traits under a run's rulebook. Below ARCHETYPE_RULES every
 * trait is off, so a run already in the field derives the road it always
 * had. Reads only the edges that count: a second clock edge buys nothing.
 */
export function traitsOf(copies: Pick<CardCopy, "id" | "card">[], rules: number): AbilityTraits {
  const titles = new Set(rules >= ARCHETYPE_RULES ? activeAbilities(copies).map((entry) => entry.ability.title) : []);
  return {
    stormproof: titles.has("Speedrunner") || titles.has("Tempo Setter"),
    hunterFinds: titles.has("Roam Enjoyer"),
    merchantDraw: titles.has("First Blood Merchant"),
    reveal: titles.has("Jungle Diff") ? "two" : titles.has("The Warden") ? "danger" : "none",
    speedrun: titles.has("Speedrunner"),
  };
}

// === the journal's line =====================================================

const ORDINALS = ["", "", "second", "third", "fourth", "fifth"];

/** "A, B and C" — the journal's list, which never takes an Oxford comma. */
function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}

/**
 * The journal's first-leg line naming the squad's edges: "The squad's
 * edge: Camp Thief, Unkillable and Gold Hoarder." An ignored edge is named
 * too, as what it is — "a second Camp Thief, which counts for nothing" —
 * so the page never pretends a duplicate did something. Null for an empty
 * squad. The caller decides whether the run's rulebook has edges at all.
 */
export function edgeLine(copies: Pick<CardCopy, "id" | "card">[]): string | null {
  const sheet = abilitySheet(copies);
  if (sheet.length === 0) return null;
  const named = new Map<string, number>();
  const counted = sheet.filter((entry) => entry.counts).map((entry) => {
    named.set(entry.ability.title, (named.get(entry.ability.title) ?? 0) + 1);
    return entry.ability.title;
  });
  const ignored = sheet.filter((entry) => !entry.counts);
  const phrases = ignored.map((entry) => {
    const before = named.get(entry.ability.title) ?? 0;
    named.set(entry.ability.title, before + 1);
    return before === 0 ? entry.ability.title : `a ${ORDINALS[before + 1] ?? "further"} ${entry.ability.title}`;
  });
  let tail = "";
  if (ignored.length === 1) {
    const leader = sheet.find((entry) => entry.copyId === ignored[0].ignoredFor);
    const beside = leader && leader.ability.title !== ignored[0].ability.title ? ` beside ${leader.ability.title}` : "";
    tail = `, and ${phrases[0]}, which counts for nothing${beside}`;
  } else if (ignored.length > 1) {
    tail = `, and ${listOf(phrases)}, which count for nothing`;
  }
  return `The squad's edge: ${listOf(counted)}${tail}.`;
}
