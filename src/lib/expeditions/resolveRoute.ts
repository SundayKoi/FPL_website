// The claim's half of the route: walks a run's road fork by fork and
// settles every card — the harm ladder, the mutations, insurance, the
// rescue roll and the edges that bend them. The order in which it draws
// from `rand` is part of the contract (see resolveRoute, and routes.test.ts,
// which pins it): a run stamped under an older rulebook must roll, and
// say, exactly what it did.
//
// Part of routes.ts, which re-exports it; see the rules there.

import type { MutationKey } from "@/lib/cards/mutations";
import { isVeteran } from "./trail";
import type { WeatherKey } from "./weather";
import {
  ARCHETYPE_RULES,
  ASSASSIN_DEEP,
  CLUTCH_HARM,
  COINFLIP_SWING,
  CONDUCTOR_DEATH,
  CONDUCTOR_STREAK,
  EDGE,
  EDGE_BIG,
  EDGE_SMALL,
  FREE_WIN_LOSE,
  FRONTLINE_DEEP,
  GANK_WIN_MULT,
  GLASS_CANNON_HARM,
  HEATER_STREAK,
  HIGHLIGHT_REWARD,
  HYPERCARRY_LAST,
  ISLAND_HOLD,
  ISLAND_HOLDS,
  JUGGERNAUT_WOUND,
  LANE_BULLY_BONUS,
  LIFELINE_BENCH_HOURS,
  LIFELINE_RESCUE,
  PLATE_TOLL,
  POKE_CAMP_WOUND,
  POSITIONING_HARM,
  POWER_FARMER_CAMP,
  SKIRMISH_HARM,
  SPACE_HAUNT,
  STREAK_CAP,
  SURGEON_WOUND,
  TURRET_FINDS,
  UNDERDOG_MARGIN,
  WAVE_CAMP_WOUND,
  WEAKSIDE_HARM,
} from "./archetypes";
import {
  EXPEDITION_TIERS,
  LOOT_MULT_CAP,
  WOUNDED_HOURS,
  decide,
  isProtected,
  shineOf,
  squadShine,
  type CardCopy,
  type ExpeditionTierKey,
  type OutcomeGrade,
} from "./config";
import {
  CACHE_LOOT,
  CURSED_AGAIN_LOST,
  DEAD_NEEDS_PUSHES,
  FRAGMENT_CHANCE,
  GHOST_HAUNT,
  GHOST_HAUNT_FLOOR,
  HOLD_LOOT,
  MOMENTUM_BONUS,
  MOMENTUM_DEATH,
  RIVAL_LOSS_LOOT,
  RIVAL_WIN_LOOT,
  ROAD_RULES,
  ROLE_CALL_BY_CHOICE,
  SCOUTED_CAMP_RISK,
  SHRINE_RISK,
  VETERAN_HOLD_LOOT,
  isCampChoice,
  isRoleCall,
  type ForkChoice,
  type RoadRef,
  type RoleCall,
} from "./forks";
import { listOf } from "./format";
import { FRAGMENT_CAP, forksFor, tollCost, underWeather, type ForkDef } from "./roads";
import { EDGE_TITLE, SHIELDS, TAKERS, caller, countedEdges, inRole, pctOf, type EdgeTitle } from "./routeEdges";
import { PUSH_SHAPE, VETERAN_SHAPE, squadAbilities } from "./forkOptions";

// === resolution ==============================================================

export type CardFateKind = "home" | "wounded" | "lost" | "dead";

const FATE_RANK: Record<CardFateKind, number> = { home: 0, wounded: 1, lost: 2, dead: 3 };

export interface CardFate {
  id: number;
  fate: CardFateKind;
  /** A mutation the card came home with (never on a dead card). */
  mutation: MutationKey | null;
  /** The bench, when wounded. */
  woundedUntil: string | null;
}

export interface RouteEvent {
  /** Which fork, or null for the run's finale. */
  fork: number | null;
  tone: "good" | "bad" | "neutral";
  text: string;
  /** The title whose edge (archetypes.ts) made this happen, so the
   *  ceremony can list the edges that fired. Absent on every other event,
   *  and on every run stamped below ARCHETYPE_RULES. */
  ability?: string;
}

/** An encounter as the resolver reads it: journal.ts decides where they
 *  fall and how a coin landed; this only applies them. `won` is the
 *  rival's verdict, `found` the hunter's — settled at derivation so the
 *  journal can say so hours before the claim. */
export interface RouteEncounter {
  leg: number;
  key: string;
  won?: boolean;
  found?: boolean;
  /** A rival encounter with nobody on the road (COMPANY_RULES): the cairn
   *  holds a cache instead. */
  alone?: boolean;
  /** The rival's username, when the rival is a real collector's run. */
  rivalName?: string;
  /** The ghost met on this leg: the dead card's name and whether it stood
   *  aside for its old team's colours. */
  ghost?: { name: string; owner?: string; team?: string | null; stood: boolean } | null;
}

// What the trail's beats do to the multiplier (CACHE_LOOT, RIVAL_WIN_LOOT,
// RIVAL_LOSS_LOOT, SHRINE_RISK, GHOST_HAUNT, GHOST_HAUNT_FLOOR) lives in
// forks.ts with the other numbers the rules page quotes.

export interface RouteResult {
  /** What the base payout is multiplied by, capped at LOOT_MULT_CAP. */
  lootMultiplier: number;
  pushes: number;
  /** Forks the squad answered with silence. */
  silences: number;
  fates: CardFate[];
  /** Map fragments found, on the finale and on the road, capped. */
  fragments: number;
  /** A free pack found on the road (the finale's comp is config.ts's). */
  comp: boolean;
  /** A Rescue's verdict; null on every other route. */
  rescued: boolean | null;
  /** The Exorcism's cleansed card; null elsewhere. */
  cleansed: number | null;
  events: RouteEvent[];
}

export interface RouteInput {
  tier: ExpeditionTierKey;
  /** How many forks the RUN had. A run launched before forks existed has
   *  none, and walks none — its squad never saw a checkpoint. Defaults to
   *  the tier's count. */
  forks?: number;
  /** The run's road: which places it walked and whether it may make a
   *  role call. Omitted, the fixed road is walked (a run from before
   *  ROAD_RULES, or a test that names the forks by their old numbers). */
  road?: RoadRef | null;
  copies: CardCopy[];
  /** One per fork, null for silence. */
  choices: (ForkChoice | null)[];
  insured: boolean;
  grade: OutcomeGrade;
  /** The Rescue's lost card or the Exorcism's afflicted one. */
  target: number | null;
  /** The trail's beats that touch the resolution. Optional: a run from
   *  before the road met none of these. */
  encounters?: RouteEncounter[];
  /** The weather the run launched under (weather.ts), or none. */
  weather?: WeatherKey | null;
  /** The collector's base camp as it stands at the claim — only the tent
   *  touches resolution, and only under ARCHETYPE_RULES. Absent or null
   *  reads as no camp. */
  camp?: { tent: number } | null;
  /** The squad's shine as the run froze it at launch (The Underdog reads
   *  it). Omitted, it is read off the copies. */
  shine?: number;
  /** The clock, for the wounded bench's end. */
  now: Date;
}

/** One of `items`, uniformly. Consumes one rand; none for a single item. */
function pick<T>(items: T[], rand: () => number): T | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0];
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

/** A second survivor comes home Voidtouched this often; the first always. */
export const VOIDTOUCHED_SECOND_CHANCE = 0.25;

// Momentum (MOMENTUM_BONUS, MOMENTUM_DEATH) and CURSED_AGAIN_LOST: forks.ts.

/** The Rescue roll: a floor everyone gets, plus shine, capped. */
export const RESCUE_BASE = 0.45;
export const RESCUE_PER_SHINE = 0.015;
export const RESCUE_CAP = 0.9;
export const RESCUE_PUSH_BONUS = 0.15;
/** When a rescue fails: each rescuer's wound chance, and the chance the
 *  camp keeps one of them too. */
export const RESCUE_FAIL_WOUNDED = 0.5;
export const RESCUE_FAIL_LOST = 0.1;

export function rescueChance(copies: CardCopy[], pushed: boolean): number {
  const shine = copies.reduce((sum, copy) => sum + shineOf(copy), 0);
  return Math.min(RESCUE_CAP, RESCUE_BASE + RESCUE_PER_SHINE * shine + (pushed ? RESCUE_PUSH_BONUS : 0));
}

const PUSH_VERB: Record<Exclude<ForkChoice, "camp" | "hold">, string> = {
  push: "they pushed through",
  favour: "a favour got them through clean",
  light: "a foil lit the way through",
  rally: "the roster rallied and took it",
  scout: "the Jungle went in first and the rest followed",
  roam: "the Mid roamed for it and the squad came out ahead",
  kite: "the Bot kited it from range and never got close",
  ward: "the Support warded the approach and they saw it coming",
};

/** A roll as decide() makes it, keeping the number drawn: null when the
 *  chance settled it without drawing. */
type Roll = { hit: boolean; value: number | null };

function roll(chance: number, rand: () => number): Roll {
  if (chance <= 0) return { hit: false, value: null };
  if (chance >= 1) return { hit: true, value: null };
  const value = rand();
  return { hit: value < chance, value };
}

/** Whether an edge decided a roll that landed: at `base` it would have
 *  missed. Unknowable, and so false, when nothing was drawn. */
function edgeLanded(outcome: Roll, base: number): boolean {
  return outcome.hit && outcome.value !== null && outcome.value >= base;
}

/** Whether an edge decided a roll that missed: at `base` it would have
 *  landed. */
function edgeSpared(outcome: Roll, base: number): boolean {
  return !outcome.hit && outcome.value !== null && outcome.value < base;
}

const FATE_WORD: Record<CardFateKind, string> = { home: "scratch", wounded: "wound", lost: "loss", dead: "death" };

/**
 * Walks the route and settles every card.
 *
 * Rand consumption, fork by fork in order: [gamble] → [push: the card it
 * lands on, then wounded, lost, dead in that order] → [push reward: the
 * card, then the chance] → [push find: fragment, then pack] → [camp:
 * wounded, then haunted, then the toll, then the camp reward's card and
 * chance]. Then the finale: the Legend wipe (no rand), the Legendary's
 * Voidtouched picks, the Rescue roll, fragments. Every roll whose chance is
 * 0 or 1 is settled without drawing, and every draw the road added comes
 * AFTER the ones the fixed road made, so a scripted queue in a test reads
 * left to right and a run from before the road rolls exactly what it did.
 *
 * Edges (ARCHETYPE_RULES) add one draw of their own: Coinflip Gamer's coin
 * on the run's first push, on a road with no coin flip — the LAST draw of
 * that fork, after its find. Everything else an edge does moves a chance
 * that was already rolled (a guard's scale, a camp edge's, Free Win Lane's
 * lose chance), narrows a pool that was already drawn from (Split Pusher,
 * Roaming Threat), or changes what an existing draw landed on (a front, a
 * shield, the tent, Silent Carry) — and a chance moved to 0 or 1 settles
 * without drawing, as every chance here does. Below ARCHETYPE_RULES none
 * of it exists, so a run stamped 5 draws, and says, exactly what it did.
 */
export function resolveRoute(input: RouteInput, rand: () => number): RouteResult {
  const forks = forksFor(input.tier, { ...(input.road ?? { runId: 0, rules: 0 }), forks: input.forks ?? input.road?.forks ?? EXPEDITION_TIERS[input.tier].forks })
    .map((fork) => underWeather(fork, input.weather));
  const abilities = squadAbilities(input.copies);
  const roleCalls = Boolean(input.road && input.road.rules >= ROAD_RULES);
  const events: RouteEvent[] = [];
  const woundedUntil = new Date(input.now.getTime() + WOUNDED_HOURS * 3_600_000).toISOString();

  const fates = new Map<number, CardFate>(
    input.copies.map((copy) => [copy.id, { id: copy.id, fate: "home", mutation: null, woundedUntil: null }]),
  );
  const alive = () => input.copies.filter((copy) => fates.get(copy.id)!.fate !== "dead");
  const unmutated = () => alive().filter((copy) => !copy.card?.mutation && fates.get(copy.id)!.mutation === null);
  const nameOf = (id: number) => input.copies.find((copy) => copy.id === id)?.playerName ?? `#${id}`;

  // The edges (archetypes.ts), under ARCHETYPE_RULES only. The sheet is the
  // launch squad's, read once: a card that dies takes its edge with it from
  // that point, and the same-kind edge it outranked stays ignored — the
  // picker told the player which edges count, and that stays true all run.
  const rules = input.road?.rules ?? 0;
  const counted = countedEdges(input.copies, rules);
  /** The copy whose counting edge is `title`, while it lives; else null. */
  const edge = (title: EdgeTitle): number | null => {
    const id = counted.get(title);
    return id !== undefined && fates.get(id)!.fate !== "dead" ? id : null;
  };
  // The base camp's tent, under the same rulebook: level 1 takes the first
  // camp wound or haunting that would land, level 2 the first toll too.
  const tent = rules >= ARCHETYPE_RULES ? Math.max(0, Math.min(2, Math.floor(input.camp?.tent ?? 0))) : 0;
  let tentHeld = false;
  let tentTolled = false;
  const takeTent = (): boolean => {
    if (!(tent >= 1) || tentHeld) return false;
    tentHeld = true;
    return true;
  };
  // A wound that lands while The Lifeline lives benches for less.
  const shortBench = new Set<number>();
  const benched = (id: number) => {
    if (edge(EDGE_TITLE.lifeline) !== null) shortBench.add(id);
    else shortBench.delete(id);
  };
  // Each shield covers its own card's first harm, once.
  const shielded = new Set<number>();
  function shieldFor(id: number, kind: CardFateKind): EdgeTitle | null {
    if (shielded.has(id)) return null;
    const title = SHIELDS.find((shield) => edge(shield) === id && (shield === EDGE_TITLE.unkillable || kind === "wounded")) ?? null;
    if (title !== null) shielded.add(id);
    return title;
  }
  /** What the edges do to the harm rolled on one card at one fork: the
   *  wound roll's scale, the lost and dead rolls' scale, and the edge that
   *  cut deepest — named when the cut decided the roll. A push's harm
   *  only: at a camp the roll is made before a card is drawn, so no card's
   *  own scale could reach it, and a camp's wound is the camp edges'. */
  function harmScale(id: number, fork: ForkDef, last: boolean): { wound: number; deep: number; by: EdgeTitle | null } {
    // [edge, wound ×, lost-and-dead ×, only when the harm is on its own card]
    const cuts: [EdgeTitle, number, number, boolean][] = [
      [EDGE_TITLE.surgeon, SURGEON_WOUND, 1, false],
      [EDGE_TITLE.weakside, WEAKSIDE_HARM, WEAKSIDE_HARM, true],
      [EDGE_TITLE.positioning, POSITIONING_HARM, POSITIONING_HARM, true],
      [EDGE_TITLE.assassin, 1, ASSASSIN_DEEP, true],
      [EDGE_TITLE.juggernaut, JUGGERNAUT_WOUND, 1, true],
      [EDGE_TITLE.frontline, 1, FRONTLINE_DEEP, true],
      [EDGE_TITLE.glassCannon, GLASS_CANNON_HARM, GLASS_CANNON_HARM, true],
    ];
    if (last) cuts.push([EDGE_TITLE.clutch, CLUTCH_HARM, CLUTCH_HARM, false]);
    if (fork.warned) cuts.push([EDGE_TITLE.skirmish, SKIRMISH_HARM, SKIRMISH_HARM, false]);
    let wound = 1;
    let deep = 1;
    let by: EdgeTitle | null = null;
    let deepest = 1;
    for (const [title, onWound, onDeep, own] of cuts) {
      const holder = edge(title);
      if (holder === null || (own && holder !== id)) continue;
      wound *= onWound;
      deep *= onDeep;
      if (Math.min(onWound, onDeep) < deepest) {
        deepest = Math.min(onWound, onDeep);
        by = title;
      }
    }
    return { wound, deep, by };
  }

  function harm(id: number, kind: CardFateKind) {
    const fate = fates.get(id)!;
    // One-of-ones cannot board a route that loses them, but the ceiling is
    // enforced here too: a rule that lives only in the gate is a rule one
    // missed check away from being nothing.
    const copy = input.copies.find((c) => c.id === id);
    const capped = copy && isProtected(copy) && FATE_RANK[kind] > FATE_RANK.wounded ? "wounded" : kind;
    if (FATE_RANK[capped] > FATE_RANK[fate.fate]) {
      fate.fate = capped;
      if (capped === "wounded") benched(id);
    }
  }
  function mutate(id: number, key: MutationKey): boolean {
    const fate = fates.get(id)!;
    const copy = input.copies.find((c) => c.id === id);
    if (fate.fate === "dead" || fate.mutation || copy?.card?.mutation) return false;
    fate.mutation = key;
    return true;
  }
  /** The second stage: a Voidtouched card that comes home from the Mythic
   *  route is Voidborn — the one mutation that replaces another. */
  function ascend(id: number): boolean {
    const fate = fates.get(id)!;
    const copy = input.copies.find((c) => c.id === id);
    if (fate.fate === "dead" || fate.mutation || copy?.card?.mutation?.key !== "voidtouched") return false;
    fate.mutation = "voidborn";
    return true;
  }

  let lootMultiplier = 1;
  let pushes = 0;
  // Momentum (the Mythic route, and the momentum edges): consecutive pushes so far.
  let streak = 0;
  let silences = 0;
  let favourSpent = false;
  let fragments = 0;
  let comp = false;
  const callsSpent = new Set<RoleCall>();
  let holdsCalled = 0;
  // What the run remembers of itself between forks.
  let tollPaid = false;
  let scouted = false;
  // Pentakill Machine pays once; The Enabler once.
  let cleanPaid = false;
  let enabled = false;
  const gambles = forks.some((fork) => fork.gamble !== null);

  /** An edge's event. The first one from any edge but its own pays The
   *  Enabler, while it lives. */
  function fire(event: RouteEvent & { ability: string }) {
    events.push(event);
    if (enabled || event.ability === EDGE_TITLE.enabler) return;
    const enabler = edge(EDGE_TITLE.enabler);
    if (enabler === null) return;
    enabled = true;
    lootMultiplier += EDGE_SMALL;
    events.push({ fork: event.fork, tone: "good", text: `The Enabler: ${nameOf(enabler)} set that up. +${pctOf(EDGE_SMALL)}%.`, ability: EDGE_TITLE.enabler });
  }
  /** An edge that moves the bag: `amount` on the multiplier, and its line,
   *  when the edge counts and its card lives. */
  function pay(title: EdgeTitle, amount: number, fork: number | null, text: (name: string) => string) {
    const id = edge(title);
    if (id === null) return;
    lootMultiplier += amount;
    fire({ fork, tone: amount >= 0 ? "good" : "bad", text: `${title}: ${text(nameOf(id))}`, ability: title });
  }

  // The trail's beats, first: none of them draws, all of them were settled
  // when the journal was written. A shrine is remembered for the fork it
  // guards; the rest move the multiplier or the bag.
  const shrines = new Set<number>();
  const ghosts = new Set<number>();
  for (const encounter of input.encounters ?? []) {
    if (encounter.key === "cache") {
      lootMultiplier += CACHE_LOOT;
      events.push({ fork: null, tone: "good", text: "An old expedition's cache on the trail: what they left was worth carrying." });
    } else if (encounter.key === "rival" && encounter.alone) {
      // Nobody else on the road: the cairn where the rival would have
      // been holds a cache.
      lootMultiplier += CACHE_LOOT;
      events.push({ fork: null, tone: "good", text: "The road was the squad's alone, and the cache under the cairn was theirs for the taking." });
    } else if (encounter.key === "rival") {
      lootMultiplier += encounter.won ? RIVAL_WIN_LOOT : -RIVAL_LOSS_LOOT;
      const rival = encounter.rivalName ? `${encounter.rivalName}'s squad` : "A rival squad";
      events.push({ fork: null, tone: encounter.won ? "good" : "bad", text: encounter.won ? `${rival} on the same trail, and yours got there first.` : `${rival} on the same trail got there first, and left less.` });
      // The rival edges move THIS run's bag, never the verdict: the other
      // squad's journal still says what it always said.
      const them = encounter.rivalName ? `${encounter.rivalName}'s squad` : "the rival squad";
      const gank = RIVAL_WIN_LOOT * (GANK_WIN_MULT - 1);
      if (encounter.won) pay(EDGE_TITLE.gank, gank, null, (name) => `${name} made ${them} pay for it — the win paid double. +${pctOf(gank)}%.`);
      else pay(EDGE_TITLE.bornWinner, RIVAL_LOSS_LOOT, null, (name) => `${name} would not hear of losing — the spot cost the squad nothing.`);
      pay(EDGE_TITLE.campThief, EDGE_BIG, null, (name) => `won or lost, ${name} came back with the rival's cache. +${pctOf(EDGE_BIG)}%.`);
    } else if (encounter.key === "ghost" && encounter.ghost?.stood) {
      lootMultiplier += CACHE_LOOT;
      events.push({ fork: null, tone: "good", text: `${encounter.ghost.name}'s ghost knew the squad's colours and stood aside; under the cairn where it stood, a cache.` });
    } else if (encounter.key === "ghost" && encounter.ghost) {
      ghosts.add(encounter.leg);
      const ghost = encounter.ghost.name;
      pay(EDGE_TITLE.counterJungler, EDGE_BIG, null, (name) => `${name} found where ${ghost}'s ghost kept its cache. +${pctOf(EDGE_BIG)}%, and it will not double the haunting.`);
    } else if (encounter.key === "hunter" && encounter.found) {
      fragments += 1;
      events.push({ fork: null, tone: "good", text: "A relic hunter on the road traded a piece of a map that shows a place the map does not." });
    } else if (encounter.key === "shrine") {
      shrines.add(encounter.leg);
    }
  }

  forks.forEach((fork, index) => {
    const answer = input.choices[index] ?? null;
    if (answer === null) silences += 1;
    // Silence camps. An unlocked-but-ineligible choice (a favour with no
    // signed card, say) also camps: the server refuses to record one, so
    // reading it here would mean the row was written around the RPC.
    let choice: ForkChoice = answer ?? "camp";
    if (choice === "favour" && (!abilities.favour || favourSpent)) choice = "camp";
    if (choice === "light" && (!abilities.light || !fork.dark)) choice = "camp";
    if (choice === "rally" && !abilities.rally) choice = "camp";
    if (isRoleCall(choice)) {
      const call = ROLE_CALL_BY_CHOICE[choice];
      // Island King: a Top may hold twice, while the King lives.
      const spent = choice === "hold" && edge(EDGE_TITLE.islandKing) !== null ? holdsCalled >= ISLAND_HOLDS : callsSpent.has(choice);
      if (!roleCalls || fork.gamble || spent || inRole(alive(), call.role).length === 0) choice = "camp";
      else {
        callsSpent.add(choice);
        if (choice === "hold") holdsCalled += 1;
      }
    }
    if (choice === "favour") favourSpent = true;

    // What the last fork left behind, read once and spent here.
    const passage = tollPaid;
    const knowing = scouted;
    tollPaid = false;
    scouted = false;
    const place = fork.title.toLowerCase();

    if (choice === "hold") {
      streak = 0;
      // A Top on the checkpoint: the safe way with nothing that makes the
      // safe way unsafe — no wound, no haunting, no toll — and a little
      // more in the bag for the night's work. A Veteran Top holds for more.
      const top = caller(alive(), "Top");
      // The Veteran gives the shape, not the miles.
      const titled = top !== undefined && !isVeteran(top) && edge(EDGE_TITLE.veteran) === top.id;
      lootMultiplier += top && (isVeteran(top) || titled) ? VETERAN_HOLD_LOOT : HOLD_LOOT;
      events.push({ fork: index, tone: "good", text: `${fork.title}: ${top ? nameOf(top.id) : "the Top"} held the checkpoint alone all night, and the squad kept everything.` });
      if (titled && top) fire({ fork: index, tone: "good", text: `The Veteran: ${nameOf(top.id)} held it like a Veteran. +${pctOf(VETERAN_HOLD_LOOT - HOLD_LOOT)}% more.`, ability: EDGE_TITLE.veteran });
      pay(EDGE_TITLE.islandKing, ISLAND_HOLD, index, (name) => `${name} ruled the island at ${place}. +${pctOf(ISLAND_HOLD)}%.`);
      return;
    }

    if (choice === "camp") {
      streak = 0;
      // A scout at the last fork means the squad knows where not to camp
      // at this one: both camp risks are halved.
      const campScale = knowing ? SCOUTED_CAMP_RISK : 1;
      if (knowing && (fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0)) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: the Jungle's scouting held — the squad knew where not to sleep.` });
      }
      const ghostHere = ghosts.has(index);
      // Free Win Lane: on a road with no coin flip, the first night is free.
      const freeNight = index === 0 && !gambles && edge(EDGE_TITLE.freeWin) !== null;
      if (freeNight && (fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0 || ghostHere)) {
        pay(EDGE_TITLE.freeWin, 0, index, (name) => `${name} knew this ground — nothing at ${place} could touch the squad.`);
      }
      const woundAt = fork.campRisk.wounded * campScale;
      const woundBy = freeNight ? null : edge(EDGE_TITLE.poke) !== null ? EDGE_TITLE.poke : edge(EDGE_TITLE.wave) !== null ? EDGE_TITLE.wave : null;
      const woundScale = freeNight ? 0 : woundBy === EDGE_TITLE.poke ? POKE_CAMP_WOUND : woundBy === EDGE_TITLE.wave ? WAVE_CAMP_WOUND : 1;
      const wound = roll(woundAt * woundScale, rand);
      if (wound.hit) {
        const victim = pick(alive(), rand);
        if (victim) {
          // The tent first, then the card's own shield: what the camp
          // absorbs, the card keeps for the road.
          const shield = takeTent() ? "tent" : shieldFor(victim.id, "wounded");
          if (shield === "tent") {
            events.push({ fork: index, tone: "good", text: `The tent held: ${place} came for ${nameOf(victim.id)} in the night, and the canvas took it.` });
          } else if (shield !== null) {
            fire({ fork: index, tone: "good", text: `${shield}: the wound meant for ${nameOf(victim.id)} at ${place} never landed.`, ability: shield });
          } else {
            harm(victim.id, "wounded");
            events.push({ fork: index, tone: "bad", text: `${fork.title}: the squad held back and ${nameOf(victim.id)} was hurt anyway.` });
          }
        }
      } else if (woundBy !== null && woundAt > 0 && (woundScale === 0 || edgeSpared(wound, woundAt))) {
        pay(woundBy, 0, index, (name) => (woundBy === EDGE_TITLE.poke ? `${name} kept everything at range — nobody could be hurt at ${place}.` : `${name} kept the camp at ${place} tidy, and the wound that was coming never came.`));
      }
      // A ghost walked the last leg: it is at the camp's edge tonight, and
      // doubles the haunting — unless a ghost edge keeps it there.
      const doubled = ghostHere ? Math.max(fork.campRisk.haunted * GHOST_HAUNT, GHOST_HAUNT_FLOOR) : fork.campRisk.haunted;
      const calm = !ghostHere ? null : edge(EDGE_TITLE.counterJungler) !== null ? EDGE_TITLE.counterJungler : edge(EDGE_TITLE.visionDenier) !== null ? EDGE_TITLE.visionDenier : null;
      const haunted = calm !== null ? fork.campRisk.haunted : doubled;
      const hauntAt = haunted * campScale;
      const spaced = edge(EDGE_TITLE.space) !== null;
      const haunt = roll(freeNight ? 0 : spaced ? hauntAt * SPACE_HAUNT : hauntAt, rand);
      if (calm !== null) pay(calm, 0, index, () => `the ghost came no closer than the edge of the camp at ${place} — the haunting did not double.`);
      if (haunt.hit) {
        const victim = pick(unmutated(), rand);
        if (victim && edge(EDGE_TITLE.silentCarry) === victim.id) {
          pay(EDGE_TITLE.silentCarry, 0, index, (name) => `something sat up with ${name} all night at ${place}, and got no answer.`);
        } else if (victim && takeTent()) {
          events.push({ fork: index, tone: "good", text: `The tent held: whatever sat up at ${place} could not get in, and ${nameOf(victim.id)} slept.` });
        } else if (victim && mutate(victim.id, "haunted")) {
          events.push({ fork: index, tone: "bad", text: ghostHere ? `${fork.title}: the ghost sat at the fire all night, and ${nameOf(victim.id)} listened to it.` : `${fork.title}: ${nameOf(victim.id)} sat up all night listening, and brought something back.` });
        }
      } else if (ghostHere) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: the ghost walked the camp's edge all night and took nothing.` });
      }
      if (spaced && edgeSpared(haunt, hauntAt)) pay(EDGE_TITLE.space, 0, index, (name) => `${name} gave the night room at ${place}, and the haunting that was coming never came.`);
      let tolled = false;
      if (fork.toll && passage) {
        // The toll paid at the last fork bought this gate too.
        events.push({ fork: index, tone: "good", text: `${fork.title}: the toll they paid at the last gate was good for this one.` });
      } else if (fork.toll && decide(fork.toll, rand)) {
        tolled = true;
        tollPaid = true;
        const plate = edge(EDGE_TITLE.plate);
        if (edge(EDGE_TITLE.priorityMerchant) !== null) {
          pay(EDGE_TITLE.priorityMerchant, 0, index, (name) => `the keeper at ${place} knew ${name} and waved the squad through.`);
        } else if (tent >= 2 && !tentTolled) {
          tentTolled = true;
          events.push({ fork: index, tone: "good", text: `The tent held: at ${place} the keeper took a night under canvas for the toll.` });
        } else {
          lootMultiplier -= plate !== null ? tollCost(input.weather) * PLATE_TOLL : tollCost(input.weather);
          events.push({ fork: index, tone: "bad", text: `${fork.title}: the safe way had a price, and the squad paid it.` });
          pay(EDGE_TITLE.plate, 0, index, (name) => `${name} talked the price at ${place} down to half.`);
        }
      }
      if (fork.campReward) {
        const bearer = pick(unmutated(), rand);
        if (bearer) {
          const chance = fork.campReward.chance;
          const reel = edge(EDGE_TITLE.highlight) !== null;
          const reward = roll(reel ? Math.min(1, chance * HIGHLIGHT_REWARD) : chance, rand);
          if (reward.hit && mutate(bearer.id, fork.campReward.mutation)) {
            events.push({ fork: index, tone: "good", text: `${fork.title}: ${nameOf(bearer.id)} waited it out and came away ${fork.campReward.mutation}.` });
            if (reel && edgeLanded(reward, chance)) pay(EDGE_TITLE.highlight, 0, index, () => `${nameOf(bearer.id)}'s night at ${place} was one for the reel.`);
          }
        }
      }
      if (fork.campRisk.wounded === 0 && fork.campRisk.haunted === 0 && !tolled && !ghostHere) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: ${answer === null ? "no word came, so the squad" : "the squad"} took the safe way.` });
      }
      // The camp edges pay for the night — a camp, never a hold.
      pay(EDGE_TITLE.farmDemon, EDGE_SMALL, index, (name) => `${name} farmed the camp at ${place}. +${pctOf(EDGE_SMALL)}%.`);
      pay(EDGE_TITLE.powerFarmer, POWER_FARMER_CAMP, index, (name) => `${name} farmed the camp at ${place}. +${pctOf(POWER_FARMER_CAMP)}%.`);
      return;
    }

    // Every other choice is a push of some kind. A role call in a Veteran's
    // hands takes the sharper shape; the caller is the squad's member in
    // that role with the most miles.
    pushes += 1;
    const veteran = isRoleCall(choice) ? caller(alive(), ROLE_CALL_BY_CHOICE[choice].role) : undefined;
    // The Veteran gives the shape, not the miles.
    const titled = veteran !== undefined && !isVeteran(veteran) && edge(EDGE_TITLE.veteran) === veteran.id;
    const shape = (isRoleCall(choice) && veteran && (isVeteran(veteran) || titled) && VETERAN_SHAPE[choice]) || PUSH_SHAPE[choice];
    if (titled && veteran && isRoleCall(choice) && VETERAN_SHAPE[choice]) {
      fire({ fork: index, tone: "good", text: `The Veteran: ${nameOf(veteran.id)} made the call at ${place} like a Veteran.`, ability: EDGE_TITLE.veteran });
    }
    if (choice === "scout") scouted = true;
    const bonus = fork.lootBonus * shape.bonus;
    // A shrine on the leg before this fork keeps its hand on the harm.
    const guard = shrines.has(index) ? SHRINE_RISK : 1;
    const riskScale = shape.risk * guard;
    const deepScale = shape.deepRisk * guard;
    const last = index === forks.length - 1;
    const unsafeCamp = fork.campRisk.wounded > 0 || fork.campRisk.haunted > 0 || Boolean(fork.toll);
    /** The loot edges a push pays whatever the harm. */
    const pushLoot = () => {
      pay(EDGE_TITLE.glassCannon, EDGE_SMALL, index, (name) => `${name} hit hard at ${place}. +${pctOf(EDGE_SMALL)}%.`);
      if (index === 0 && bonus > 0) pay(EDGE_TITLE.laneBully, bonus * (LANE_BULLY_BONUS - 1), index, (name) => `${name} bullied the first fork — its bonus ×${LANE_BULLY_BONUS}. +${pctOf(bonus * (LANE_BULLY_BONUS - 1))}%.`);
      if (last && bonus > 0) pay(EDGE_TITLE.hypercarry, bonus * (HYPERCARRY_LAST - 1), index, (name) => `${name} carried the last fork — its bonus ×${HYPERCARRY_LAST}. +${pctOf(bonus * (HYPERCARRY_LAST - 1))}%.`);
      if (fork.dark) pay(EDGE_TITLE.burstMage, EDGE, index, (name) => `${name} burst through the dark at ${place}. +${pctOf(EDGE)}%.`);
      if (unsafeCamp) pay(EDGE_TITLE.engage, EDGE, index, (name) => `${name} went in where nobody could camp safely. +${pctOf(EDGE)}%.`);
      if (isRoleCall(choice)) pay(EDGE_TITLE.playmaker, EDGE_SMALL, index, (name) => `${name} made the play. +${pctOf(EDGE_SMALL)}%.`);
      if (fork.warned) pay(EDGE_TITLE.duelist, EDGE, index, (name) => `${name} took the fight they were warned about. +${pctOf(EDGE)}%.`);
    };
    /** The loot edges a push pays when nobody was hurt on it. */
    const cleanLoot = () => {
      if (!cleanPaid && edge(EDGE_TITLE.pentakill) !== null) {
        cleanPaid = true;
        pay(EDGE_TITLE.pentakill, EDGE_BIG, index, (name) => `${name} came out of ${place} clean, the first time this run. +${pctOf(EDGE_BIG)}%.`);
      }
      pay(EDGE_TITLE.executioner, EDGE_SMALL, index, (name) => `nobody hurt at ${place}, and ${name} took the finish. +${pctOf(EDGE_SMALL)}%.`);
    };

    if (fork.gamble) {
      // Free Win Lane shades the coin; Coinflip Gamer doubles its swing
      // both ways. The loot edges ride the win: a lost flip pays none.
      const freeWin = edge(EDGE_TITLE.freeWin) !== null;
      const flip = roll(freeWin ? Math.max(0, fork.gamble.lose - FREE_WIN_LOSE) : fork.gamble.lose, rand);
      if (flip.hit) {
        lootMultiplier -= fork.gamble.down;
        events.push({ fork: index, tone: "bad", text: `${fork.title}: the camp was empty and the detour cost them.` });
        const doubled = fork.gamble.down * (COINFLIP_SWING - 1);
        pay(EDGE_TITLE.coinflip, -doubled, index, (name) => `${name} let it ride at ${place}, and the loss doubled. −${pctOf(doubled)}%.`);
      } else {
        lootMultiplier += bonus;
        events.push({ fork: index, tone: "good", text: `${fork.title}: the camp was real, and unguarded.` });
        if (freeWin && edgeSpared(flip, fork.gamble.lose)) pay(EDGE_TITLE.freeWin, 0, index, (name) => `${name} knew the odds at ${place} were better than they looked, and they were.`);
        pay(EDGE_TITLE.coinflip, bonus * (COINFLIP_SWING - 1), index, (name) => `${name} let it ride at ${place}, and the win doubled. +${pctOf(bonus * (COINFLIP_SWING - 1))}%.`);
        pushLoot();
        cleanLoot();
      }
      return;
    }

    // Momentum: on the Mythic route every consecutive push before this one
    // raises the bonus and the death roll — the death roll at half the rate
    // in Tempo Conductor's hands.
    const carried = input.tier === "mythic" ? streak : 0;
    lootMultiplier += bonus + MOMENTUM_BONUS * carried;
    const deathStep = edge(EDGE_TITLE.conductor) !== null ? MOMENTUM_DEATH * CONDUCTOR_DEATH : MOMENTUM_DEATH;
    const deadRisk = fork.pushRisk.dead + deathStep * carried;
    if (carried > 0) events.push({ fork: index, tone: "neutral", text: `${fork.title}: the momentum carried — ${carried} push${carried === 1 ? "" : "es"} behind them, +${Math.round(MOMENTUM_BONUS * carried * 100)}% to the bag and +${Math.round(deathStep * carried * 100)}% to the death roll.` });
    // The momentum edges carry on every route, up to STREAK_CAP pushes.
    const heat = Math.min(streak, STREAK_CAP);
    if (heat > 0) {
      const behind = `${heat} push${heat === 1 ? "" : "es"} in a row`;
      pay(EDGE_TITLE.heater, HEATER_STREAK * heat, index, (name) => `${name} is on a heater — ${behind}. +${pctOf(HEATER_STREAK * heat)}%.`);
      pay(EDGE_TITLE.conductor, CONDUCTOR_STREAK * heat, index, (name) => `${name} kept the tempo — ${behind}. +${pctOf(CONDUCTOR_STREAK * heat)}%${carried > 0 ? ", and the death roll climbs at half the rate" : ""}.`);
    }
    streak += 1;
    pushLoot();
    // Whose head it lands on. One card for most pushes; the Jungle for a
    // scout (they went in first — no draw when there is one of them); two
    // cards for a roam, or one in Roaming Threat's hands.
    const victims: CardCopy[] = [];
    let stepped: { id: number; for: number; title: EdgeTitle } | null = null;
    const threat = shape.victims === "two" ? edge(EDGE_TITLE.roamingThreat) : null;
    const spread = threat !== null ? "one" : shape.victims;
    if (riskScale > 0 || deepScale > 0) {
      if (spread === "jungle") {
        // The Jungle who went in first — the one who made the call. With
        // one Jungle there is nothing to draw; with two the road picks.
        // No front stands in front of a scout: going first is the call.
        const junglers = inRole(alive(), "Jungle") as CardCopy[];
        const first = junglers.length === 1 ? junglers[0] : pick(junglers.length > 0 ? junglers : alive(), rand);
        if (first) victims.push(first);
      } else {
        // Split Pusher is out of the pool while another living card can
        // take it — the same one draw, over the others.
        const splitter = edge(EDGE_TITLE.splitPusher);
        const pool = (from: CardCopy[]) => (splitter !== null && from.some((copy) => copy.id !== splitter) ? from.filter((copy) => copy.id !== splitter) : from);
        const first = pick(pool(alive()), rand);
        if (first) victims.push(first);
        if (spread === "two" && first) {
          const second = pick(pool(alive().filter((copy) => copy.id !== first.id)), rand);
          if (second) victims.push(second);
        }
        // A front takes the first hit for a squadmate: no draw, just a
        // card stepping in.
        for (const title of TAKERS) {
          const front = edge(title);
          if (front === null || victims.length === 0 || victims.some((victim) => victim.id === front)) continue;
          stepped = { id: front, for: victims[0].id, title };
          victims[0] = input.copies.find((copy) => copy.id === front)!;
          break;
        }
      }
      if (threat !== null) fire({ fork: index, tone: "good", text: `Roaming Threat: ${nameOf(threat)} roamed alone at ${place} — the harm was rolled on one card, not two.`, ability: EDGE_TITLE.roamingThreat });
    }
    let anyHarm = false;
    for (const victim of victims) {
      const scale = harmScale(victim.id, fork, last);
      const wound = roll(Math.min(1, fork.pushRisk.wounded * riskScale * scale.wound), rand);
      const lost = roll(Math.min(1, fork.pushRisk.lost * deepScale * scale.deep), rand);
      const dead = pushes >= DEAD_NEEDS_PUSHES ? roll(Math.min(1, deadRisk * deepScale * scale.deep), rand) : null;
      let worst: CardFateKind = dead?.hit ? "dead" : lost.hit ? "lost" : wound.hit ? "wounded" : "home";
      // The same rolls with no edge on this card: what the edges changed.
      const bareAt = (outcome: Roll | null, chance: number) => (outcome === null ? false : outcome.value !== null ? outcome.value < Math.min(1, chance) : outcome.hit);
      const bare: CardFateKind = bareAt(dead, deadRisk * deepScale) ? "dead" : bareAt(lost, fork.pushRisk.lost * deepScale) ? "lost" : bareAt(wound, fork.pushRisk.wounded * riskScale) ? "wounded" : "home";
      if (FATE_RANK[bare] > FATE_RANK[worst] && scale.by !== null) {
        fire({ fork: index, tone: "good", text: `${scale.by}: it should have been a ${FATE_WORD[bare]} for ${nameOf(victim.id)} at ${place}. It was not.`, ability: scale.by });
      } else if (FATE_RANK[worst] > FATE_RANK[bare] && edge(EDGE_TITLE.glassCannon) === victim.id) {
        fire({ fork: index, tone: "bad", text: `Glass Cannon: ${nameOf(victim.id)} cracked at ${place} where another card would have held.`, ability: EDGE_TITLE.glassCannon });
      }
      if (worst === "home") continue;
      const shield = shieldFor(victim.id, worst);
      if (shield !== null) {
        fire({
          fork: index,
          tone: "good",
          text: stepped?.id === victim.id
            ? `${shield}: ${nameOf(victim.id)} stepped in front of ${nameOf(stepped.for)} at ${place} and shrugged it off.`
            : `${shield}: the ${FATE_WORD[worst]} meant for ${nameOf(victim.id)} at ${place} never landed.`,
          ability: shield,
        });
        continue;
      }
      anyHarm = true;
      if (stepped?.id === victim.id) {
        const sacrifice = stepped.title === EDGE_TITLE.sacrificial;
        if (sacrifice) lootMultiplier += EDGE_BIG;
        fire({ fork: index, tone: sacrifice ? "good" : "neutral", text: `${stepped.title}: ${nameOf(victim.id)} stepped in front of ${nameOf(stepped.for)} at ${place} and took it.${sacrifice ? ` +${pctOf(EDGE_BIG)}%.` : ""}`, ability: stepped.title });
      }
      // The warned fork's price: go wrong here and the card is Cursed. A
      // wound becomes the curse; a loss or a death carries it too — unless
      // the card has ice in its veins, and then the harm stands, uncursed.
      if (fork.warned) {
        if (edge(EDGE_TITLE.ice) === victim.id) {
          fire({ fork: index, tone: "good", text: `Ice In The Veins: they were warned at ${place}, and ${nameOf(victim.id)} did not flinch — no curse.`, ability: EDGE_TITLE.ice });
        } else {
          const cursed = mutate(victim.id, "cursed");
          if (worst === "wounded") worst = "home";
          if (cursed) events.push({ fork: index, tone: "bad", text: `${fork.title}: they were warned. ${nameOf(victim.id)} comes home Cursed.` });
        }
      }
      if (worst !== "home") {
        harm(victim.id, worst);
        const verb = worst === "dead" ? "did not survive it" : worst === "lost" ? "did not come out" : "was carried out";
        events.push({ fork: index, tone: "bad", text: `${fork.title}: they pushed, and ${nameOf(victim.id)} ${verb}.` });
      }
    }
    if (!anyHarm) {
      events.push({ fork: index, tone: "good", text: `${fork.title}: ${PUSH_VERB[choice]}.` });
      cleanLoot();
    }
    if (fork.pushReward) {
      const bearer = pick(unmutated(), rand);
      if (bearer) {
        const chance = fork.pushReward.chance;
        const reel = edge(EDGE_TITLE.highlight) !== null;
        const reward = roll(reel ? Math.min(1, chance * HIGHLIGHT_REWARD) : chance, rand);
        if (reward.hit && mutate(bearer.id, fork.pushReward.mutation)) {
          events.push({ fork: index, tone: "good", text: `${fork.title}: ${nameOf(bearer.id)} came out of it ${fork.pushReward.mutation}.` });
          if (reel && edgeLanded(reward, chance)) pay(EDGE_TITLE.highlight, 0, index, () => `${nameOf(bearer.id)} came out of ${place} looking like a highlight.`);
        }
      }
    }
    if (fork.pushFind?.fragment && decide(fork.pushFind.fragment, rand)) {
      fragments += 1;
      events.push({ fork: index, tone: "good", text: `${fork.title}: in the haul, a fragment of a map that shows a place the map does not.` });
    }
    if (fork.pushFind?.comp) {
      const chance = fork.pushFind.comp;
      const melter = edge(EDGE_TITLE.turret) !== null;
      const find = roll(melter ? Math.min(1, chance * TURRET_FINDS) : chance, rand);
      if (find.hit) {
        comp = true;
        events.push({ fork: index, tone: "good", text: `${fork.title}: a sealed pack, unopened, in with the rest. It is yours.` });
        if (melter && edgeLanded(find, chance)) pay(EDGE_TITLE.turret, 0, index, (name) => `${name} broke open one more crate at ${place}, and the pack was in it.`);
      }
    }
    // Coinflip Gamer on a road with no coin flip: the run's first push is
    // one. Its draw is this fork's last, after the find.
    if (pushes === 1 && !gambles && bonus > 0 && edge(EDGE_TITLE.coinflip) !== null) {
      const heads = rand() < 0.5;
      pay(EDGE_TITLE.coinflip, heads ? bonus : -bonus, index, (name) =>
        heads ? `${name} called the first push on a coin — heads, and ${place} paid twice. +${pctOf(bonus)}%.` : `${name} called the first push on a coin — tails, and ${place} paid nothing. −${pctOf(bonus)}%.`,
      );
    }
  });

  // The finale.
  let rescued: boolean | null = null;
  let cleansed: number | null = null;

  // A curse you ignore compounds: a Cursed card out again on a route that
  // can lose it may not come back. Only where the route can lose a card —
  // a raid cannot, and the claim RPC would refuse a loss there anyway.
  if (input.tier === "legend" || input.tier === "legendary") {
    for (const copy of alive()) {
      if (copy.card?.mutation?.key === "cursed" && fates.get(copy.id)!.fate !== "lost" && decide(CURSED_AGAIN_LOST, rand)) {
        harm(copy.id, "lost");
        events.push({ fork: null, tone: "bad", text: `${nameOf(copy.id)} was Cursed, and went out anyway. It did not come back.` });
      }
    }
  }

  if (input.tier === "legend" && abilities.rally && silences >= 2) {
    // The chemistry that helps you is the same thing that sinks you: a
    // one-roster squad ignored twice moves as one, and is lost as one.
    for (const copy of alive()) harm(copy.id, "lost");
    events.push({ fork: null, tone: "bad", text: "Nobody answered twice, and a squad that moves as one roster is lost as one. All three are missing." });
  }

  if (input.tier === "legendary") {
    const survivors = alive();
    if (survivors.length === 0) {
      events.push({ fork: null, tone: "bad", text: "Nobody came home." });
    } else {
      const first = pick(unmutated(), rand);
      if (first && mutate(first.id, "voidtouched")) {
        events.push({ fork: null, tone: "good", text: `${nameOf(first.id)} came back through the rift Voidtouched.` });
      }
      if (decide(VOIDTOUCHED_SECOND_CHANCE, rand)) {
        const second = pick(unmutated(), rand);
        if (second && mutate(second.id, "voidtouched")) {
          events.push({ fork: null, tone: "good", text: `${nameOf(second.id)} came back Voidtouched too.` });
        }
      }
    }
  }

  if (input.tier === "mythic") {
    const survivors = alive();
    if (survivors.length === 0) {
      events.push({ fork: null, tone: "bad", text: "Nobody came home from past the rift." });
    } else {
      // The Voidtouched come home Voidborn; the rest come home Voidtouched,
      // the way the Legendary route sends them.
      for (const copy of survivors) {
        if (ascend(copy.id)) events.push({ fork: null, tone: "good", text: `${nameOf(copy.id)} went back through the rift and came home Voidborn.` });
      }
      const first = pick(unmutated(), rand);
      if (first && mutate(first.id, "voidtouched")) {
        events.push({ fork: null, tone: "good", text: `${nameOf(first.id)} came back through the rift Voidtouched.` });
      }
    }
  }

  if (input.tier === "rescue") {
    const pushed = !isCampChoice(input.choices[0] ?? "camp");
    // The Lifeline's hand on the rescue, inside RESCUE_CAP: a rescue is
    // never a certainty.
    const chance = rescueChance(input.copies, pushed);
    const lifeline = edge(EDGE_TITLE.lifeline) !== null;
    const verdict = roll(lifeline ? Math.min(RESCUE_CAP, chance + LIFELINE_RESCUE) : chance, rand);
    rescued = verdict.hit;
    if (rescued) {
      events.push({ fork: null, tone: "good", text: "They found the lost card and brought it home. It is wounded, and it is home." });
      if (lifeline && edgeLanded(verdict, chance)) pay(EDGE_TITLE.lifeline, 0, null, (name) => `${name} got them in — the rescue turned on it.`);
    } else {
      events.push({ fork: null, tone: "bad", text: "The camp was ready for them. The lost card is still out there." });
      for (const copy of alive()) {
        if (decide(RESCUE_FAIL_WOUNDED, rand)) harm(copy.id, "wounded");
      }
      if (decide(RESCUE_FAIL_LOST, rand)) {
        const taken = pick(alive(), rand);
        if (taken) {
          harm(taken.id, "lost");
          events.push({ fork: null, tone: "bad", text: `${nameOf(taken.id)} did not make it out either.` });
        }
      }
    }
  }

  if (input.tier === "exorcism") {
    cleansed = input.target;
    events.push({ fork: null, tone: "good", text: `${input.target === null ? "The card" : nameOf(input.target)} came home clean. Whatever it carried is gone.` });
  }

  // Insurance, last: it reads the settled fate, and turns it down one rung.
  if (input.insured) {
    for (const fate of fates.values()) {
      if (fate.fate === "dead") {
        fate.fate = "lost";
        events.push({ fork: null, tone: "neutral", text: `Insurance: ${nameOf(fate.id)} is lost, not dead. A week to bring them home.` });
      } else if (fate.fate === "lost") {
        fate.fate = "wounded";
        benched(fate.id);
        events.push({ fork: null, tone: "neutral", text: `Insurance: ${nameOf(fate.id)} was carried home instead of left behind.` });
      }
    }
  }

  // The finale edges: after insurance, before the clamp. An exorcism has
  // no bag for them to fill.
  if (counted.size > 0 && input.tier !== "exorcism") {
    if ((input.shine ?? squadShine(input.copies)) <= EXPEDITION_TIERS[input.tier].minShine + UNDERDOG_MARGIN) {
      pay(EDGE_TITLE.underdog, EDGE_BIG, null, (name) => `nobody gave this squad a chance, and ${name} made them pay. +${pctOf(EDGE_BIG)}%.`);
    }
    pay(EDGE_TITLE.jack, EDGE_SMALL, null, (name) => `${name} did a bit of everything. +${pctOf(EDGE_SMALL)}%.`);
    if (Math.round(lootMultiplier * 100) < 100 && edge(EDGE_TITLE.lateGame) !== null) {
      const short = 1 - lootMultiplier;
      lootMultiplier = 1;
      pay(EDGE_TITLE.lateGame, 0, null, (name) => `${name} made sure the bag came home no lighter than it left. +${pctOf(short)}%.`);
    }
  }

  const fragmentChance = FRAGMENT_CHANCE[input.tier]?.[input.grade] ?? 0;
  if (decide(fragmentChance, rand)) {
    fragments += 1;
    events.push({ fork: null, tone: "good", text: "Among the haul: a fragment of a map that shows a place the map does not." });
  }

  const shortUntil = new Date(input.now.getTime() + LIFELINE_BENCH_HOURS * 3_600_000).toISOString();
  const eased: number[] = [];
  for (const fate of fates.values()) {
    if (fate.fate === "wounded") {
      fate.woundedUntil = shortBench.has(fate.id) ? shortUntil : woundedUntil;
      if (shortBench.has(fate.id)) eased.push(fate.id);
    }
    if (fate.fate === "dead") fate.mutation = null;
  }
  if (eased.length > 0) {
    const names = eased.map(nameOf);
    const who = listOf(names);
    fire({ fork: null, tone: "good", text: `The Lifeline: ${who} ${eased.length === 1 ? "is" : "are"} benched ${LIFELINE_BENCH_HOURS}h, not ${WOUNDED_HOURS}h.`, ability: EDGE_TITLE.lifeline });
  }

  return {
    lootMultiplier: Math.max(0.1, Math.min(LOOT_MULT_CAP, Math.round(lootMultiplier * 100) / 100)),
    pushes,
    silences,
    fates: input.copies.map((copy) => fates.get(copy.id)!),
    fragments: Math.min(FRAGMENT_CAP, fragments),
    comp,
    rescued,
    cleansed,
    events,
  };
}
