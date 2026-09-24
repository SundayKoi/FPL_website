// The half of the road a browser may hold: the words a squad can say at a
// fork, when each fork opens and closes, what the role calls are called,
// how big each route's road is and the numbers the rules page quotes — and
// nothing about which places a run will actually walk.
//
// routes.ts holds the road itself (ROADS: every place, its story, its
// numbers) and the resolver that walks it. That table is the spoiler: a
// module that ships it to the board ships every checkpoint a squad has not
// reached yet, one hover away. So the pieces the board genuinely needs on
// the client live here, with no import from routes.ts or journal.ts, and
// routes.ts re-exports every one of them so no server caller changes. The
// page (a server component) derives what the squad KNOWS of its road
// (views.ts) and hands the board only that.
//
// Pure, like routes.ts: no clock of its own, no randomness, no database.

import type { MutationKey } from "@/lib/cards/mutations";
import type { AbilityKind } from "./archetypes";
import { EXPEDITION_TIERS, WOUNDED_HOURS, type CardCopy, type ExpeditionTierKey, type OutcomeGrade } from "./config";

/** What a player can say at a fork. `camp` and `push` are always there;
 *  favour, light and rally are what the squad's prints unlock; the five
 *  after them are the role calls — what the squad's POSITIONS unlock. */
export type ForkChoice = "camp" | "push" | "favour" | "light" | "rally" | "hold" | "scout" | "roam" | "kite" | "ward";

export const FORK_CHOICES: ForkChoice[] = ["camp", "push", "favour", "light", "rally", "hold", "scout", "roam", "kite", "ward"];

/** The rulebook version from which a run walks a drawn road, meets the
 *  wider trail and can make a role call. queries.ts's TRAIL_RULES (2) is
 *  the version before it; a run stamped below this walks the fixed forks
 *  in FORKS and knows five words at a checkpoint. Lives here, not in
 *  queries.ts, because the resolver is pure and queries.ts is not — and
 *  here rather than routes.ts because the board asks it too. */
export const ROAD_RULES = 3;

/** The rulebook version from which the road has company (company.ts):
 *  rivals are real collectors' runs decided by shine, and the graveyard's
 *  dead walk the Legend and Legendary roads. A run stamped below this
 *  keeps its coin-tossed rival and meets no ghost — its journal is half
 *  written, and a beat that changed under it would rewrite lines the
 *  page already showed. */
export const COMPANY_RULES = 4;

/** What a run needs to hand the road-drawing functions: its seed, its
 *  rulebook, and the convoy it rides in (a convoy's two runs must draw the
 *  same road, so the convoy id seeds both). */
export interface RoadRef {
  runId: number;
  rules: number;
  convoy?: number | null;
  /** How many forks the RUN has, when it differs from the tier's count
   *  (a run from before forks existed has none). */
  forks?: number;
  /** A road handed down rather than drawn (campaigns.ts): one place key
   *  per checkpoint. A slot whose key is unknown falls back to the draw,
   *  and the draw's stream is consumed either way so the other slots
   *  match the seeded road. */
  places?: string[] | null;
}

// === the numbers the page quotes =============================================

/** Death needs this many pushes on the run, counting the one being
 *  rolled. "Only after two reckless forks." */
export const DEAD_NEEDS_PUSHES = 2;

/** What holding a checkpoint is worth: a Top's call camps with none of
 *  the camp's risks and this much more loot — more for a Veteran Top. */
export const HOLD_LOOT = 0.1;
export const VETERAN_HOLD_LOOT = 0.15;
/** A scout at one fork means the squad knows where not to camp at the
 *  next: its camp risks are scaled by this. */
export const SCOUTED_CAMP_RISK = 0.5;
/** What a toll fork takes off the multiplier when the squad pays it. */
export const TOLL_LOOT = 0.15;

/** Where a fragment can turn up, and how often. Only the Legend Hunt
 *  drops them reliably: three is the price of the Legendary route, and a
 *  Deep Raid jackpot is the one other way in. */
export const FRAGMENT_CHANCE: Partial<Record<ExpeditionTierKey, Partial<Record<OutcomeGrade, number>>>> = {
  raid: { jackpot: 0.25 },
  legend: { solid: 0.35, jackpot: 1 },
};

/** What the trail's beats do to the multiplier, for the ones that touch
 *  it. A cache is found; a rival is beaten or not; a shrine keeps its
 *  hand on the next fork's harm. */
export const CACHE_LOOT = 0.15;
export const RIVAL_WIN_LOOT = 0.2;
export const RIVAL_LOSS_LOOT = 0.1;
/** A shrine on leg i halves the push risk at fork i — the one the squad
 *  reaches next. */
export const SHRINE_RISK = 0.5;
/** A ghost on leg i walks the camp at fork i: the haunting is rolled at
 *  GHOST_HAUNT times the fork's own, and never under GHOST_HAUNT_FLOOR —
 *  a fork whose camp was safe is not safe with a ghost at its edge. */
export const GHOST_HAUNT = 2;
export const GHOST_HAUNT_FLOOR = 0.2;

/** Momentum, the Mythic route's own rule: each consecutive push raises the
 *  NEXT push's bonus by this much and its death roll by this much. A camp
 *  or a hold lets the momentum go. */
export const MOMENTUM_BONUS = 0.1;
export const MOMENTUM_DEATH = 0.05;

/** A Cursed card sent out again on a route that can lose it has this
 *  chance of not coming back. A curse you ignore compounds. */
export const CURSED_AGAIN_LOST = 0.15;

// The trail's numbers (journal.ts draws the beats; these are what the
// rules page quotes about them). journal.ts re-exports every one.

/** How often a leg on a road carries an encounter at all. */
export const ROAD_ENCOUNTER_CHANCE = 0.45;
/** Hours a storm holds the squad. Applied once per storm by the sweep. */
export const STORM_HOURS = 2;
/** What bringing a stranger's lost card home pays the rescuer. */
export const STRANDED_BOUNTY = 150;
/** How often a relic hunter actually has a fragment to trade. */
export const HUNTER_FRAGMENT_CHANCE = 0.3;

/** One place on a road that can change a card for good, and how. */
export interface MutationSource {
  tier: ExpeditionTierKey;
  /** The place's title, as ROADS prints it. */
  place: string;
  mutation: MutationKey;
  /** Pushing through it, or camping at it. */
  by: "push" | "camp";
  chance: number;
}

/**
 * Every place a mutation can come from on the road, in ROADS order (route,
 * checkpoint, place; a push reward, then a camp reward, then a camp's
 * haunting) — the rules page's "where each comes from". Copied out of ROADS
 * for the same reason as ROAD_SIZES: the rules are public, the table that
 * says which place a run will draw is not. routes.test.ts derives this list
 * from ROADS and holds the two equal.
 */
export const MUTATION_SOURCES: readonly MutationSource[] = Object.freeze([
  { tier: "gilded", place: "The toll bridge", mutation: "hardened", by: "push", chance: 0.15 },
  { tier: "gilded", place: "The gilded gate", mutation: "hardened", by: "push", chance: 0.15 },
  { tier: "raid", place: "The reactor", mutation: "irradiated", by: "push", chance: 0.2 },
  { tier: "raid", place: "The flooded works", mutation: "irradiated", by: "push", chance: 0.2 },
  { tier: "raid", place: "The signal mast", mutation: "hardened", by: "push", chance: 0.1 },
  { tier: "raid", place: "The brutal fork", mutation: "hardened", by: "push", chance: 0.2 },
  { tier: "raid", place: "The barricade", mutation: "hardened", by: "push", chance: 0.2 },
  { tier: "raid", place: "The dog pits", mutation: "hardened", by: "push", chance: 0.15 },
  { tier: "legend", place: "The glowing shaft", mutation: "irradiated", by: "push", chance: 0.15 },
  { tier: "legend", place: "The drowned chapel", mutation: "irradiated", by: "push", chance: 0.15 },
  { tier: "legend", place: "The furnace hall", mutation: "hardened", by: "push", chance: 0.15 },
  { tier: "legend", place: "The wrong checkpoint", mutation: "haunted", by: "camp", chance: 0.15 },
  { tier: "legend", place: "The empty village", mutation: "haunted", by: "camp", chance: 0.15 },
  { tier: "legend", place: "The bell tower", mutation: "hardened", by: "camp", chance: 0.1 },
  { tier: "legend", place: "The bell tower", mutation: "haunted", by: "camp", chance: 0.2 },
  { tier: "legendary", place: "The threshold", mutation: "hardened", by: "push", chance: 0.15 },
  { tier: "legendary", place: "The stair that goes both ways", mutation: "hardened", by: "push", chance: 0.15 },
  { tier: "mythic", place: "The unmade road", mutation: "haunted", by: "camp", chance: 0.2 },
  { tier: "mythic", place: "The stairwell of hours", mutation: "haunted", by: "camp", chance: 0.2 },
  { tier: "mythic", place: "The blackwater", mutation: "haunted", by: "camp", chance: 0.2 },
  { tier: "mythic", place: "The orrery", mutation: "haunted", by: "camp", chance: 0.2 },
  { tier: "mythic", place: "The hollow", mutation: "haunted", by: "camp", chance: 0.3 },
  { tier: "mythic", place: "The cathedral of teeth", mutation: "haunted", by: "camp", chance: 0.25 },
  { tier: "mythic", place: "The eclipse", mutation: "haunted", by: "camp", chance: 0.3 },
  { tier: "mythic", place: "The throne of glass", mutation: "haunted", by: "camp", chance: 0.25 },
  { tier: "mythic", place: "The far shore", mutation: "haunted", by: "camp", chance: 0.2 },
  { tier: "mythic", place: "The last door", mutation: "haunted", by: "camp", chance: 0.3 },
] satisfies MutationSource[]);

/**
 * How many distinct places each route's road can hold: every place in every
 * slot of ROADS. The atlas (a road walked end to end) and the rules page
 * count against it, and neither may import ROADS to do so — the count is a
 * number, the places are the secret. routes.test.ts holds this table equal
 * to ROADS, so a place added there without a line here fails the tests.
 */
export const ROAD_SIZES: Readonly<Record<ExpeditionTierKey, number>> = Object.freeze({
  scout: 4,
  gilded: 6,
  raid: 6,
  legend: 9,
  rescue: 3,
  exorcism: 0,
  legendary: 12,
  mythic: 10,
});

// === role calls ===============================================================

export type RoleCall = Extract<ForkChoice, "hold" | "scout" | "roam" | "kite" | "ward">;

export interface RoleCallDef {
  choice: RoleCall;
  /** The role word as printed on cards (ROLE_LABELS in cards/build.ts). */
  role: string;
  label: string;
  /** What it does, in the button's words. */
  tease: string;
  /** Whether it is a kind of push (rolls the fork's harm) or a kind of
   *  camp (the safe way, made safer). */
  kind: "push" | "camp";
}

/**
 * The five role calls — one per position the league prints, each once a
 * run, each the shape of the role's job in the actual game:
 *
 *   Top holds: a camp with none of the camp's risks (no wound, no haunt,
 *     no toll) and a little more loot. A Top spends the night on an island
 *     and is fine.
 *   Jungle scouts: a push at three-quarter risk, and whatever goes wrong
 *     goes wrong for the Jungle, who went in first.
 *   Mid roams: a push for half again the loot, with the harm rolled on two
 *     cards instead of one. Tempo, at a price.
 *   Bot kites: a push for half the loot at a quarter of the risk. Take
 *     what you can from range and never get close.
 *   Support wards: a push where the wound roll is what it was but the
 *     lost and dead rolls are halved. You see the danger coming.
 */
export const ROLE_CALLS: RoleCallDef[] = [
  { choice: "hold", role: "Top", label: "Hold the checkpoint", tease: `Camp, and nothing that can happen to a camper happens. +${Math.round(HOLD_LOOT * 100)}% loot. A Top's call, once a run.`, kind: "camp" },
  { choice: "scout", role: "Jungle", label: "Scout it first", tease: "Push at three-quarter risk, and whatever goes wrong lands on the Jungle. Once a run.", kind: "push" },
  { choice: "roam", role: "Mid", label: "Roam for it", tease: "Push for 50% more loot; the harm is rolled on two cards, not one. A Mid's call, once a run.", kind: "push" },
  { choice: "kite", role: "Bot", label: "Kite it", tease: "Push for half the loot at a quarter of the risk. A Bot's call, once a run.", kind: "push" },
  { choice: "ward", role: "Support", label: "Ward the approach", tease: "Push with the lost and dead rolls halved. A Support's call, once a run.", kind: "push" },
];

/** What the call says on the button when a Veteran is making it. */
export const VETERAN_TEASE: Record<RoleCall, string> = {
  hold: `Veteran Top: +${Math.round(VETERAN_HOLD_LOOT * 100)}% instead.`,
  scout: "Veteran Jungle: half risk instead.",
  roam: "Veteran Mid: 75% more loot instead.",
  kite: "Veteran Bot: an eighth of the risk instead.",
  ward: "Veteran Support: lost and dead rolls to a quarter.",
};

export const ROLE_CALL_BY_CHOICE: Record<RoleCall, RoleCallDef> = Object.fromEntries(ROLE_CALLS.map((call) => [call.choice, call])) as Record<RoleCall, RoleCallDef>;

export function isRoleCall(choice: ForkChoice | null): choice is RoleCall {
  return choice !== null && choice in ROLE_CALL_BY_CHOICE;
}

/** Whether a choice keeps the squad where it is. `hold` is a camp with a
 *  Top's name on it; everything else that is not `camp` moves. */
export function isCampChoice(choice: ForkChoice | null): boolean {
  return choice === "camp" || choice === "hold";
}

// === the fork's buttons ======================================================

/** One edge's word on one option: what THIS edge does to THIS choice at
 *  THIS fork — the fork prompt's "why" line. */
export interface ForkEdge {
  title: string;
  kind: AbilityKind;
  /** The squad card whose title it is. */
  copyId: number;
  /** The sentence, title first: "Unkillable: the first harm on Kai is
   *  ignored." */
  line: string;
}

export interface ForkOption {
  choice: ForkChoice;
  label: string;
  /** What it does, for the button's caption. Under ARCHETYPE_RULES it
   *  ends with the edge sentences, so a caption printed whole says what
   *  the squad's edges do to this choice. */
  tease: string;
  /** Why it is not available, when it is not. */
  locked: string | null;
  /** The role a call needs, for the five that need one. */
  role?: string;
  /** The squad's edges that act on this choice here, in the order the
   *  tease ends with them. Absent when none do, below ARCHETYPE_RULES,
   *  and on a locked option. */
  edges?: ForkEdge[];
  /** The tease before the edge sentences, for a prompt that prints
   *  `edges` on a line of its own. Present exactly when `edges` is. */
  baseTease?: string;
}

// === timing ==================================================================

export interface ForkWindow {
  index: number;
  opensAt: Date;
  closesAt: Date;
}

/**
 * When each fork opens and closes. N forks split the run into N+1 legs;
 * fork i opens at the end of leg i and stays open until the end of the
 * next leg, so a 24-hour raid pauses at 8h and 16h and each fork waits
 * eight hours for an answer. decide_expedition_fork computes the same
 * window in SQL — this is what the page reads; that is what the write
 * checks.
 */
export function forkWindows(startedAt: string, resolvesAt: string, forks: number): ForkWindow[] {
  const start = new Date(startedAt).getTime();
  const end = new Date(resolvesAt).getTime();
  const span = end - start;
  const legs = forks + 1;
  const windows: ForkWindow[] = [];
  for (let i = 1; i <= forks; i += 1) {
    windows.push({
      index: i - 1,
      opensAt: new Date(start + (span * i) / legs),
      closesAt: new Date(start + (span * (i + 1)) / legs),
    });
  }
  return windows;
}

export type ForkStatus = "pending" | "open" | "decided" | "missed";

export interface ForkView extends ForkWindow {
  status: ForkStatus;
  /** What was chosen, or null while pending/open, or "camp" once missed. */
  choice: ForkChoice | null;
}

/** One recorded answer, as the run row stores it in `choices`. */
export interface RecordedChoice {
  index: number;
  choice: ForkChoice;
  at: string;
}

/** Every fork on a run with where it stands right now. */
export function forkViews(
  run: { startedAt: string; resolvesAt: string; forks: number; choices: RecordedChoice[] },
  now: Date,
): ForkView[] {
  const decided = new Map(run.choices.map((choice) => [choice.index, choice.choice]));
  return forkWindows(run.startedAt, run.resolvesAt, run.forks).map((window) => {
    const choice = decided.get(window.index) ?? null;
    if (choice) return { ...window, status: "decided", choice };
    if (now.getTime() < window.opensAt.getTime()) return { ...window, status: "pending", choice: null };
    if (now.getTime() < window.closesAt.getTime()) return { ...window, status: "open", choice: null };
    return { ...window, status: "missed", choice: "camp" };
  });
}

/** The fork waiting on an answer right now, or null. */
export function openFork(
  run: { startedAt: string; resolvesAt: string; forks: number; choices: RecordedChoice[] },
  now: Date,
): ForkView | null {
  return forkViews(run, now).find((fork) => fork.status === "open") ?? null;
}

/**
 * The choices as the resolver reads them: one per fork, in order, null
 * where the squad was never told. Silence resolves as camp INSIDE
 * resolveRoute, but it is kept distinct here because the Legend Hunt's
 * wipe rule counts silences, not camps.
 */
export function choiceSheet(forks: number, choices: RecordedChoice[]): (ForkChoice | null)[] {
  const decided = new Map(choices.map((choice) => [choice.index, choice.choice]));
  return Array.from({ length: forks }, (_, index) => decided.get(index) ?? null);
}

// === the launch card =========================================================

/** The consent line for a launch card: which of the picked cards can be
 *  hurt on this route, and how badly. */
export function consentLine(tier: ExpeditionTierKey, copies: Pick<CardCopy, "playerName">[], insured: boolean): string {
  const def = EXPEDITION_TIERS[tier];
  const risk = insured ? (def.risk === "dead" ? "lost" : def.risk === "lost" ? "wounded" : def.risk) : def.risk;
  if (risk === "none") return "Nothing on this run can hurt a card.";
  const names = copies.map((copy) => copy.playerName);
  const who = names.length === 0 ? "Every card you send" : names.join(", ");
  if (risk === "wounded") return `${who} can come home wounded: benched from expeditions for ${WOUNDED_HOURS / 24} days.`;
  if (risk === "lost") return `${who} can be lost here. A lost card has ${7} days to be rescued or ransomed, then it is gone for good.`;
  return `${who} can DIE on this route, for good, once the squad has pushed ${DEAD_NEEDS_PUSHES} forks. There is no rescue from dead.`;
}
