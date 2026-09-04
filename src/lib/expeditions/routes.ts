// The route inside a run: the forks that pause it, what each choice risks
// and earns, and what the squad looks like when it comes home.
//
// config.ts owns the money (grade, base dollars, comps, marks). This file
// owns everything the redesign added on top: the checkpoints, the choices,
// the harm ladder (wounded → lost → dead), the mutations, insurance and
// the rescue roll. Pure, like config.ts — `rand` is injected, the clock is
// passed in — so every table below is unit-testable and the server's
// CSPRNG is a drop-in.
//
// The rules, in the order a player meets them:
//   1. A run with N forks pauses N times, at evenly spaced checkpoints.
//      Each fork is open until the next checkpoint (or the end of the run).
//      Silence is a choice: an unanswered fork camps, the safe option.
//   2. Pushing adds to the loot multiplier and rolls one harm on one card.
//      Camping is safe on the ladder — except where the story says it is
//      not (the Legend Hunt's second checkpoint haunts; every Legendary
//      fork bites even a camper).
//   3. A card can die only on the Legendary route and only once the squad
//      has pushed twice. Insurance turns lost into wounded and dead into
//      lost. One-of-ones never board a route that can lose them.
//   4. Mutations are one per copy and permanent. A roll that lands on an
//      already-mutated card does nothing.

import type { MutationKey } from "@/lib/cards/mutations";
import {
  EXPEDITION_TIERS,
  LOOT_MULT_CAP,
  WOUNDED_HOURS,
  isProtected,
  shineOf,
  type CardCopy,
  type ExpeditionTierKey,
  type OutcomeGrade,
} from "./config";

/** What a player can say at a fork. `camp` and `push` are always there;
 *  the other three are what the squad's own cards unlock. */
export type ForkChoice = "camp" | "push" | "favour" | "light" | "rally";

export const FORK_CHOICES: ForkChoice[] = ["camp", "push", "favour", "light", "rally"];

export interface ForkDef {
  title: string;
  story: string;
  /** The button labels — what pushing and camping mean HERE. */
  pushLabel: string;
  campLabel: string;
  /** Added to the loot multiplier when the squad pushes. */
  lootBonus: number;
  /** Rolled on one random living card when the squad pushes. Each is a
   *  chance; they resolve worst-last so a dead roll outranks a wound. */
  pushRisk: { wounded: number; lost: number; dead: number };
  /** Rolled when the squad camps. Zero everywhere the ladder is kind. */
  campRisk: { wounded: number; haunted: number };
  /** A mutation pushing can bring home, on one unmutated card. */
  pushReward: { mutation: MutationKey; chance: number } | null;
  /** The squad warns against this one. Push anyway and have it go wrong,
   *  and the harmed card comes home Cursed. */
  warned: boolean;
  /** Dark enough that a foil can light the way (halves the push risk). */
  dark: boolean;
  /** The scouting run's fork is a coin flip on the bag, not a hazard:
   *  push and it either grows or shrinks. */
  gamble: { lose: number; down: number } | null;
}

const NO_PUSH_RISK = { wounded: 0, lost: 0, dead: 0 };
const NO_CAMP_RISK = { wounded: 0, haunted: 0 };

/**
 * Every fork on every route. The numbers are the balance of the feature:
 * a Deep Raid pushed twice is a 40% chance of a mutation against a 30%
 * chance of a three-day bench; a Legendary route pushed at every fork is
 * a coin flip on a funeral.
 */
export const FORKS: Record<ExpeditionTierKey, ForkDef[]> = {
  scout: [
    {
      title: "The dry riverbed",
      story: "The trail forks at a dry riverbed. Downstream is the road home with what you have. Upstream, the scouts think they saw a camp.",
      pushLabel: "Follow the riverbed up",
      campLabel: "Head home with the bag",
      lootBonus: 0.4,
      pushRisk: NO_PUSH_RISK,
      campRisk: NO_CAMP_RISK,
      pushReward: null,
      warned: false,
      dark: false,
      gamble: { lose: 0.45, down: 0.3 },
    },
  ],
  raid: [
    {
      title: "The reactor",
      story: "A cooling tower leans over the valley and something inside it is still humming. The salvage in there is worth a fortune and glows faintly.",
      pushLabel: "Go into the reactor",
      campLabel: "Skirt the valley",
      lootBonus: 0.25,
      pushRisk: { wounded: 0.15, lost: 0, dead: 0 },
      campRisk: NO_CAMP_RISK,
      pushReward: { mutation: "irradiated", chance: 0.2 },
      warned: false,
      dark: false,
      gamble: null,
    },
    {
      title: "The brutal fork",
      story: "The ridge road is held. The squad can force it, and the ones who force it come back harder, or they come back carried.",
      pushLabel: "Force the ridge",
      campLabel: "Take the long way round",
      lootBonus: 0.25,
      pushRisk: { wounded: 0.3, lost: 0, dead: 0 },
      campRisk: NO_CAMP_RISK,
      pushReward: { mutation: "hardened", chance: 0.2 },
      warned: false,
      dark: true,
      gamble: null,
    },
  ],
  legend: [
    {
      title: "The glowing shaft",
      story: "An old mine shaft breathes warm green air. The map says the seam runs deep.",
      pushLabel: "Descend the shaft",
      campLabel: "Stay on the surface",
      lootBonus: 0.3,
      pushRisk: { wounded: 0.2, lost: 0, dead: 0 },
      campRisk: NO_CAMP_RISK,
      pushReward: { mutation: "irradiated", chance: 0.15 },
      warned: false,
      dark: true,
      gamble: null,
    },
    {
      title: "The wrong checkpoint",
      story: "Night falls at a checkpoint nobody built. Push on through the dark, or camp here — the squad says the place feels watched.",
      pushLabel: "March through the night",
      campLabel: "Camp at the checkpoint",
      lootBonus: 0.3,
      pushRisk: { wounded: 0.25, lost: 0, dead: 0 },
      campRisk: { wounded: 0, haunted: 0.15 },
      pushReward: null,
      warned: false,
      dark: true,
      gamble: null,
    },
    {
      title: "The vault door",
      story: "The legend's vault, and the squad's every instinct says walk away. Whatever is behind it is worth the run twice over.",
      pushLabel: "Open the vault",
      campLabel: "Walk away with the haul",
      lootBonus: 0.4,
      pushRisk: { wounded: 0.3, lost: 0.15, dead: 0 },
      campRisk: NO_CAMP_RISK,
      pushReward: null,
      warned: true,
      dark: false,
      gamble: null,
    },
  ],
  rescue: [
    {
      title: "The holding camp",
      story: "The lost card is in there. Go in loud and fast, or wait for dark and slip in.",
      pushLabel: "Go in loud",
      campLabel: "Wait for dark",
      lootBonus: 0,
      pushRisk: { wounded: 0.35, lost: 0, dead: 0 },
      campRisk: { wounded: 0.15, haunted: 0 },
      pushReward: null,
      warned: false,
      dark: true,
      gamble: null,
    },
  ],
  exorcism: [],
  legendary: [
    {
      title: "The threshold",
      story: "The fragments fit together and the map shows a door where there is no door. Past it the ground is wrong.",
      pushLabel: "Cross the threshold running",
      campLabel: "Cross it slowly",
      lootBonus: 0.3,
      pushRisk: { wounded: 0.25, lost: 0.1, dead: 0 },
      campRisk: { wounded: 0.1, haunted: 0 },
      pushReward: { mutation: "hardened", chance: 0.15 },
      warned: false,
      dark: true,
      gamble: null,
    },
    {
      title: "The singing dark",
      story: "Something is singing under the floor and the squad wants to leave. There is light ahead, and the singing gets louder toward it.",
      pushLabel: "Follow the light",
      campLabel: "Hold position",
      lootBonus: 0.3,
      pushRisk: { wounded: 0.25, lost: 0.15, dead: 0.2 },
      campRisk: { wounded: 0.1, haunted: 0 },
      pushReward: null,
      warned: true,
      dark: true,
      gamble: null,
    },
    {
      title: "The rift",
      story: "A tear in the air, and stars on the other side that are not ours. The map fragments are pulling toward it.",
      pushLabel: "Go through the rift",
      campLabel: "Edge around it",
      lootBonus: 0.3,
      pushRisk: { wounded: 0.25, lost: 0.15, dead: 0.3 },
      campRisk: { wounded: 0.15, haunted: 0 },
      pushReward: null,
      warned: false,
      dark: false,
      gamble: null,
    },
    {
      title: "The way home",
      story: "The door is behind you and closing. Everything the route promised is in the last chamber, and the squad is begging to go.",
      pushLabel: "Take the last chamber",
      campLabel: "Go home now",
      lootBonus: 0.4,
      pushRisk: { wounded: 0.25, lost: 0.2, dead: 0.4 },
      campRisk: { wounded: 0.1, haunted: 0 },
      pushReward: null,
      warned: true,
      dark: false,
      gamble: null,
    },
  ],
};

/** Death needs this many pushes on the run, counting the one being
 *  rolled. "Only after two reckless forks." */
export const DEAD_NEEDS_PUSHES = 2;

/** What the squad's own cards unlock at a fork. */
export interface SquadAbilities {
  /** A signed card can call in a favour: the push bonus with no risk,
   *  once per run. */
  favour: boolean;
  /** A foil lights a dark fork: push at half the risk. */
  light: boolean;
  /** Three from one roster rally: double the push bonus, half again the
   *  risk — and the wipe rule on a Legend Hunt (see resolveRoute). */
  rally: boolean;
}

export function squadAbilities(copies: Pick<CardCopy, "signed" | "foil" | "card">[]): SquadAbilities {
  const teams = new Set(copies.map((copy) => (copy.card?.teamName ?? "").trim().toLowerCase()).filter(Boolean));
  return {
    favour: copies.some((copy) => copy.signed),
    light: copies.some((copy) => copy.foil),
    rally: copies.length === 3 && teams.size === 1,
  };
}

export interface ForkOption {
  choice: ForkChoice;
  label: string;
  /** What it does, for the button's caption. */
  tease: string;
  /** Why it is not available, when it is not. */
  locked: string | null;
}

/**
 * The choices at one fork, for this squad, given what has already been
 * spent. Everything is listed — locked options say why — so the page
 * teaches what a signed card or a full roster would have bought.
 */
export function forkOptions(
  tier: ExpeditionTierKey,
  index: number,
  copies: Pick<CardCopy, "signed" | "foil" | "card">[],
  earlier: (ForkChoice | null)[],
): ForkOption[] {
  const fork = FORKS[tier][index];
  if (!fork) return [];
  const abilities = squadAbilities(copies);
  const favourSpent = earlier.includes("favour");
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const risk = worstRisk(fork);
  const bonus = fork.gamble ? `${pct(fork.lootBonus)} more or ${pct(fork.gamble.down)} less` : `+${pct(fork.lootBonus)} loot`;
  return [
    {
      choice: "camp",
      label: fork.campLabel,
      tease: fork.campRisk.haunted > 0
        ? `Keep what you have. ${pct(fork.campRisk.haunted)} chance a card comes home Haunted.`
        : fork.campRisk.wounded > 0
          ? `The careful way. Still ${pct(fork.campRisk.wounded)} to wound a card here.`
          : "Keep what you have. Nothing is risked.",
      locked: null,
    },
    {
      choice: "push",
      label: fork.pushLabel,
      tease: fork.gamble
        ? `${bonus}. Nothing can hurt a card on this run.`
        : `${bonus}. ${risk}${fork.pushReward ? ` ${pct(fork.pushReward.chance)} to bring home ${fork.pushReward.mutation}.` : ""}${fork.warned ? " The squad warns against it: go wrong here and the card comes home Cursed." : ""}`,
      locked: null,
    },
    {
      choice: "favour",
      label: "Call in a favour",
      tease: `${bonus} with no risk. A signed card's favour, once per run.`,
      locked: !abilities.favour ? "Needs a signed card in the squad." : favourSpent ? "Already spent on this run." : null,
    },
    {
      choice: "light",
      label: "Light the way",
      tease: `Push at half the risk. A foil lights a dark fork.`,
      locked: !fork.dark ? "This fork is not dark." : !abilities.light ? "Needs a foil in the squad." : null,
    },
    {
      choice: "rally",
      label: "Rally the roster",
      tease: `Push for double the loot at half again the risk. Three from one team.`,
      locked: !abilities.rally ? "Needs three cards from one roster." : null,
    },
  ];
}

function worstRisk(fork: ForkDef): string {
  const pct = (n: number) => `${Math.round(n * 100)}%`;
  const parts: string[] = [];
  if (fork.pushRisk.wounded > 0) parts.push(`${pct(fork.pushRisk.wounded)} a card is wounded`);
  if (fork.pushRisk.lost > 0) parts.push(`${pct(fork.pushRisk.lost)} one is lost`);
  if (fork.pushRisk.dead > 0) parts.push(`${pct(fork.pushRisk.dead)} one dies (after ${DEAD_NEEDS_PUSHES} pushes)`);
  return parts.length ? `${parts.join(", ")}.` : "No risk.";
}

/** Whether a choice is one the squad can actually make here. The server
 *  checks this before the RPC writes it; the RPC only knows the five words. */
export function choiceAllowed(
  tier: ExpeditionTierKey,
  index: number,
  choice: ForkChoice,
  copies: Pick<CardCopy, "signed" | "foil" | "card">[],
  earlier: (ForkChoice | null)[],
): boolean {
  return forkOptions(tier, index, copies, earlier).some((option) => option.choice === choice && option.locked === null);
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
}

export interface RouteResult {
  /** What the base payout is multiplied by, capped at LOOT_MULT_CAP. */
  lootMultiplier: number;
  pushes: number;
  /** Forks the squad answered with silence. */
  silences: number;
  fates: CardFate[];
  /** Map fragments found. */
  fragments: number;
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
  copies: CardCopy[];
  /** One per fork, null for silence. */
  choices: (ForkChoice | null)[];
  insured: boolean;
  grade: OutcomeGrade;
  /** The Rescue's lost card or the Exorcism's afflicted one. */
  target: number | null;
  /** The clock, for the wounded bench's end. */
  now: Date;
}

/** A chance that isn't one. Zero and one are settled without touching the
 *  stream, the config.ts discipline, so a chance tuned to 0 never shifts
 *  what a later roll reads. */
function decide(chance: number, rand: () => number): boolean {
  if (chance <= 0) return false;
  if (chance >= 1) return true;
  return rand() < chance;
}

/** One of `items`, uniformly. Consumes one rand; none for a single item. */
function pick<T>(items: T[], rand: () => number): T | undefined {
  if (items.length === 0) return undefined;
  if (items.length === 1) return items[0];
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

/** Where a fragment can turn up, and how often. Only the Legend Hunt
 *  drops them reliably: three is the price of the Legendary route, and a
 *  Deep Raid jackpot is the one other way in. */
export const FRAGMENT_CHANCE: Partial<Record<ExpeditionTierKey, Partial<Record<OutcomeGrade, number>>>> = {
  raid: { jackpot: 0.25 },
  legend: { solid: 0.35, jackpot: 1 },
};

/** A second survivor comes home Voidtouched this often; the first always. */
export const VOIDTOUCHED_SECOND_CHANCE = 0.25;

/** A Cursed card sent out again on a route that can lose it has this
 *  chance of not coming back. A curse you ignore compounds. */
export const CURSED_AGAIN_LOST = 0.15;

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

/**
 * Walks the route and settles every card.
 *
 * Rand consumption, fork by fork in order: [gamble] → [push: the card it
 * lands on, then wounded, lost, dead in that order] → [push reward: the
 * card, then the chance] → [camp: wounded, then haunted]. Then the
 * finale: the Legend wipe (no rand), the Legendary's Voidtouched picks,
 * the Rescue roll, fragments. Every roll whose chance is 0 or 1 is settled
 * without drawing, so a scripted queue in a test reads left to right.
 */
export function resolveRoute(input: RouteInput, rand: () => number): RouteResult {
  const forks = FORKS[input.tier].slice(0, input.forks ?? EXPEDITION_TIERS[input.tier].forks);
  const abilities = squadAbilities(input.copies);
  const events: RouteEvent[] = [];
  const woundedUntil = new Date(input.now.getTime() + WOUNDED_HOURS * 3_600_000).toISOString();

  const fates = new Map<number, CardFate>(
    input.copies.map((copy) => [copy.id, { id: copy.id, fate: "home", mutation: null, woundedUntil: null }]),
  );
  const alive = () => input.copies.filter((copy) => fates.get(copy.id)!.fate !== "dead");
  const unmutated = () => alive().filter((copy) => !copy.card?.mutation && fates.get(copy.id)!.mutation === null);
  const nameOf = (id: number) => input.copies.find((copy) => copy.id === id)?.playerName ?? `#${id}`;

  function harm(id: number, kind: CardFateKind) {
    const fate = fates.get(id)!;
    // One-of-ones cannot board a route that loses them, but the ceiling is
    // enforced here too: a rule that lives only in the gate is a rule one
    // missed check away from being nothing.
    const copy = input.copies.find((c) => c.id === id);
    const capped = copy && isProtected(copy) && FATE_RANK[kind] > FATE_RANK.wounded ? "wounded" : kind;
    if (FATE_RANK[capped] > FATE_RANK[fate.fate]) fate.fate = capped;
  }
  function mutate(id: number, key: MutationKey): boolean {
    const fate = fates.get(id)!;
    const copy = input.copies.find((c) => c.id === id);
    if (fate.fate === "dead" || fate.mutation || copy?.card?.mutation) return false;
    fate.mutation = key;
    return true;
  }

  let lootMultiplier = 1;
  let pushes = 0;
  let silences = 0;
  let favourSpent = false;

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
    if (choice === "favour") favourSpent = true;

    if (choice === "camp") {
      if (decide(fork.campRisk.wounded, rand)) {
        const victim = pick(alive(), rand);
        if (victim) {
          harm(victim.id, "wounded");
          events.push({ fork: index, tone: "bad", text: `${fork.title}: the squad held back and ${nameOf(victim.id)} was hurt anyway.` });
        }
      }
      if (decide(fork.campRisk.haunted, rand)) {
        const victim = pick(unmutated(), rand);
        if (victim && mutate(victim.id, "haunted")) {
          events.push({ fork: index, tone: "bad", text: `${fork.title}: ${nameOf(victim.id)} sat up all night listening, and brought something back.` });
        }
      }
      if (fork.campRisk.wounded === 0 && fork.campRisk.haunted === 0) {
        events.push({ fork: index, tone: "neutral", text: `${fork.title}: ${answer === null ? "no word came, so the squad" : "the squad"} took the safe way.` });
      }
      return;
    }

    // Every other choice is a push of some kind.
    pushes += 1;
    const bonus = choice === "rally" ? fork.lootBonus * 2 : fork.lootBonus;
    const riskScale = choice === "favour" ? 0 : choice === "light" ? 0.5 : choice === "rally" ? 1.5 : 1;

    if (fork.gamble) {
      if (decide(fork.gamble.lose, rand)) {
        lootMultiplier -= fork.gamble.down;
        events.push({ fork: index, tone: "bad", text: `${fork.title}: the camp was empty and the detour cost them.` });
      } else {
        lootMultiplier += bonus;
        events.push({ fork: index, tone: "good", text: `${fork.title}: the camp was real, and unguarded.` });
      }
      return;
    }

    lootMultiplier += bonus;
    const victim = riskScale > 0 ? pick(alive(), rand) : undefined;
    let worst: CardFateKind = "home";
    if (victim) {
      if (decide(Math.min(1, fork.pushRisk.wounded * riskScale), rand)) worst = "wounded";
      if (decide(Math.min(1, fork.pushRisk.lost * riskScale), rand)) worst = "lost";
      if (pushes >= DEAD_NEEDS_PUSHES && decide(Math.min(1, fork.pushRisk.dead * riskScale), rand)) worst = "dead";
    }
    if (victim && worst !== "home") {
      // The warned fork's price: go wrong here and the card is Cursed. A
      // wound becomes the curse; a loss or a death carries it too.
      if (fork.warned) {
        const cursed = mutate(victim.id, "cursed");
        if (worst === "wounded") worst = "home";
        if (cursed) events.push({ fork: index, tone: "bad", text: `${fork.title}: they were warned. ${nameOf(victim.id)} comes home Cursed.` });
      }
      if (worst !== "home") {
        harm(victim.id, worst);
        const verb = worst === "dead" ? "did not survive it" : worst === "lost" ? "did not come out" : "was carried out";
        events.push({ fork: index, tone: "bad", text: `${fork.title}: they pushed, and ${nameOf(victim.id)} ${verb}.` });
      }
    } else {
      events.push({
        fork: index,
        tone: "good",
        text: `${fork.title}: ${choice === "favour" ? "a favour got them through clean" : choice === "light" ? "a foil lit the way through" : choice === "rally" ? "the roster rallied and took it" : "they pushed through"}.`,
      });
    }
    if (fork.pushReward) {
      const bearer = pick(unmutated(), rand);
      if (bearer && decide(fork.pushReward.chance, rand) && mutate(bearer.id, fork.pushReward.mutation)) {
        events.push({ fork: index, tone: "good", text: `${fork.title}: ${nameOf(bearer.id)} came out of it ${fork.pushReward.mutation}.` });
      }
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

  if (input.tier === "rescue") {
    const pushed = (input.choices[0] ?? "camp") !== "camp";
    rescued = decide(rescueChance(input.copies, pushed), rand);
    if (rescued) {
      events.push({ fork: null, tone: "good", text: "They found the lost card and brought it home. It is wounded, and it is home." });
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
        events.push({ fork: null, tone: "neutral", text: `Insurance: ${nameOf(fate.id)} was carried home instead of left behind.` });
      }
    }
  }

  let fragments = 0;
  const fragmentChance = FRAGMENT_CHANCE[input.tier]?.[input.grade] ?? 0;
  if (decide(fragmentChance, rand)) {
    fragments = 1;
    events.push({ fork: null, tone: "good", text: "Among the haul: a fragment of a map that shows a place the map does not." });
  }

  for (const fate of fates.values()) {
    if (fate.fate === "wounded") fate.woundedUntil = woundedUntil;
    if (fate.fate === "dead") fate.mutation = null;
  }

  return {
    lootMultiplier: Math.max(0.1, Math.min(LOOT_MULT_CAP, Math.round(lootMultiplier * 100) / 100)),
    pushes,
    silences,
    fates: input.copies.map((copy) => fates.get(copy.id)!),
    fragments,
    rescued,
    cleansed,
    events,
  };
}

/** The consent line for a launch card: which of the picked cards can be
 *  hurt on this route, and how badly. */
export function consentLine(tier: ExpeditionTierKey, copies: CardCopy[], insured: boolean): string {
  const def = EXPEDITION_TIERS[tier];
  const risk = insured ? (def.risk === "dead" ? "lost" : def.risk === "lost" ? "wounded" : def.risk) : def.risk;
  if (risk === "none") return "Nothing on this run can hurt a card.";
  const names = copies.map((copy) => copy.playerName);
  const who = names.length === 0 ? "Every card you send" : names.join(", ");
  if (risk === "wounded") return `${who} can come home wounded: benched from expeditions and the Gauntlet for ${WOUNDED_HOURS / 24} days.`;
  if (risk === "lost") return `${who} can be lost here. A lost card has ${7} days to be rescued or ransomed, then it is gone for good.`;
  return `${who} can DIE on this route, for good, once the squad has pushed ${DEAD_NEEDS_PUSHES} forks. There is no rescue from dead.`;
}
