// The trail journal: what a squad writes home between forks.
//
// A run used to be a countdown. Now it is a countdown with a story: two
// lines a leg from the trail, an arrival line as the squad reaches each
// checkpoint, and on some legs an ENCOUNTER — a beat with no decision in
// it that still changes the run. A merchant pays for what the squad has
// found so far. A stranded card from another player's lost run can be
// carried home for a bounty. A storm delays the run two hours.
//
// Everything is DERIVED, nothing is stored: the lines and the encounters
// are seeded by the run's id and leg, so the page, the Discord ping and
// the claim all read the same journal from the same row without a write.
// The sweep applies a storm's delay when its hour arrives and records
// that it did (expedition_runs.encounters), and the claim applies the
// merchant's dollars and the stranded rescue; the journal itself never
// needs the database.
//
// Squad banter at a fork reads the same way: the fork's story line gains
// a sentence keyed on who is standing there — a Support wants to camp, a
// Jungle knows a way round, two teammates vouch for each other — so the
// same fork reads differently with a different squad.

import { mulberry32 } from "@/lib/gauntlet/sim";
import { TRAIL_RULES } from "./queries";
import { EXPEDITION_TIERS, MERCHANT_DOLLARS, type CardCopy, type ExpeditionTierKey } from "./config";
import { FORKS, forkWindows } from "./routes";

export type EncounterKey = "merchant" | "stranded" | "storm";

/** How often a leg carries an encounter at all. */
export const ENCOUNTER_CHANCE = 0.35;
/** Hours a storm holds the squad. Applied once per storm by the sweep. */
export const STORM_HOURS = 2;
/** What bringing a stranger's lost card home pays the rescuer. */
export const STRANDED_BOUNTY = 150;

export interface Encounter {
  leg: number;
  key: EncounterKey;
  /** When it happens on the trail — the middle of its leg. */
  at: Date;
}

export interface JournalEntry {
  at: Date;
  leg: number;
  kind: "trail" | "arrive" | "encounter" | "home";
  text: string;
  encounter?: EncounterKey;
}

type Squad = Pick<CardCopy, "id" | "playerName" | "role" | "signed" | "foil" | "card">[];

/** The trail, by route: what the squad sees between checkpoints. `{name}`
 *  is one squad member, `{role}` their role. Each route owns its own
 *  weather; a Scouting Run should never read like the Legendary route. */
const TRAIL: Record<ExpeditionTierKey, string[]> = {
  scout: [
    "{name} found tracks at the riverbed. Fresh, and heading upstream.",
    "A quiet morning. {name} is complaining about the {role} rotations again.",
    "The squad shared the last of the rations. Nobody said anything about it.",
    "{name} spotted a camp on the ridge and argued for an hour about whose it was.",
    "Light rain. {name} is keeping the map dry under a jacket.",
    "They passed a marker from a run that came this way last week.",
  ],
  raid: [
    "{name} says the humming from the valley is louder than the map suggested.",
    "The squad is arguing about the reactor. {name} wants to go in; nobody else does.",
    "A geiger counter somebody packed started ticking, then stopped.",
    "{name} found salvage worth carrying and carried it, complaining the whole way.",
    "The ridge road is held. The squad can see the lights from here.",
    "{name} has not slept. Says the glow keeps them up.",
  ],
  legend: [
    "The mine shaft breathes warm air. {name} dropped a stone in and never heard it land.",
    "A checkpoint nobody built. {name} does not want to camp here and says so, twice.",
    "{name} swears something is walking alongside the squad just past the torchlight.",
    "They found the old expedition's marks on a wall. The last one is unfinished.",
    "The squad shared a fire. {name} told the story of the vault, badly.",
    "Cold. {name} is rationing the light.",
  ],
  rescue: [
    "{name} found the trail the lost card was dragged along. It is still fresh.",
    "The holding camp has two sentries. {name} counted three times to be sure.",
    "They waited for dark. {name} kept watch and kept quiet.",
    "A signal from inside the camp, or {name} imagining one.",
  ],
  exorcism: [
    "The squad set the circle. {name} read the words twice and got them right the second time.",
    "Something in the card answered. {name} says it sounded tired.",
    "Salt, chalk, and a long wait. {name} is holding the candle.",
  ],
  legendary: [
    "The fragments fit together and the map shows a door where there is no door.",
    "The ground is wrong past the threshold. {name} is walking carefully and slowly.",
    "Something is singing under the floor. {name} asked the squad to stop humming along.",
    "Stars on the other side of the rift, and none of them are ours. {name} has stopped talking.",
    "The door behind them is closing an inch an hour. {name} measured it.",
    "{name} looked into the last chamber and came back with nothing to say.",
  ],
};

/** What arriving at a checkpoint reads like: the fork's own title. */
function arrivalLine(tier: ExpeditionTierKey, leg: number, name: string): string {
  const fork = FORKS[tier][leg];
  if (!fork) return `${name} can see the way home from here.`;
  return `The squad reached ${fork.title.toLowerCase()}. ${name} is waiting on word.`;
}

const ENCOUNTER_LINES: Record<EncounterKey, string> = {
  merchant: `A merchant on the trail paid ${MERCHANT_DOLLARS} for what the squad had found so far. {name} did the haggling.`,
  stranded: "A stranded card from somebody else's lost run, half-buried by the trail. {name} is carrying it home.",
  storm: `A storm came in off the ridge. The squad is sheltering; the run is ${STORM_HOURS} hours behind.`,
};

/** The legs of a run: leg i runs from the end of fork i-1 to the end of
 *  fork i, the last one to the run's end. */
function legs(run: { startedAt: string; resolvesAt: string; forks: number }): { start: Date; end: Date }[] {
  const start = new Date(run.startedAt).getTime();
  const end = new Date(run.resolvesAt).getTime();
  const windows = forkWindows(run.startedAt, run.resolvesAt, run.forks);
  const bounds = [start, ...windows.map((window) => window.opensAt.getTime()), end];
  const out: { start: Date; end: Date }[] = [];
  for (let i = 0; i + 1 < bounds.length; i += 1) out.push({ start: new Date(bounds[i]), end: new Date(bounds[i + 1]) });
  return out;
}

function at(leg: { start: Date; end: Date }, fraction: number): Date {
  return new Date(leg.start.getTime() + (leg.end.getTime() - leg.start.getTime()) * fraction);
}

/** A run's seed: the id, which nothing else shares. */
function seedOf(runId: number, leg: number, salt: number): () => number {
  return mulberry32((runId * 7919 + leg * 131 + salt) >>> 0);
}

function pick<T>(items: T[], rand: () => number): T {
  return items[Math.min(items.length - 1, Math.floor(rand() * items.length))];
}

function fill(template: string, squad: Squad, rand: () => number): string {
  const member = squad.length > 0 ? pick(squad, rand) : null;
  return template
    .replaceAll("{name}", member?.playerName ?? "The squad")
    .replaceAll("{role}", member?.role ?? "lane");
}

/**
 * The encounters a run carries, decided once from its id. An Exorcism
 * has none — nothing on the trail interrupts a rite — and a run from
 * before forks existed has no legs to carry them.
 */
export function encountersFor(run: { id: number; tier: ExpeditionTierKey; startedAt: string; resolvesAt: string; forks: number; rules?: number }): Encounter[] {
  // A run that launched before the trail existed meets nothing on it: its
  // clock, its payout and its squad are exactly what it set out with.
  if (run.rules !== undefined && run.rules < TRAIL_RULES) return [];
  if (run.tier === "exorcism" || run.forks === 0) return [];
  const out: Encounter[] = [];
  legs(run).forEach((leg, index) => {
    const rand = seedOf(run.id, index, 1);
    if (rand() >= ENCOUNTER_CHANCE) return;
    // Stranded cards only turn up on routes that can lose one — that is
    // where the lost are.
    const keys: EncounterKey[] = ["merchant", "storm"];
    if (EXPEDITION_TIERS[run.tier].risk === "lost" || EXPEDITION_TIERS[run.tier].risk === "dead") keys.push("stranded");
    out.push({ leg: index, key: pick(keys, rand), at: at(leg, 0.5) });
  });
  return out;
}

/**
 * Every journal line written so far, oldest first. `now` gates them: a
 * line the squad has not reached yet is not written yet, which is what
 * makes the page worth coming back to.
 */
export function journalFor(
  run: { id: number; tier: ExpeditionTierKey; startedAt: string; resolvesAt: string; forks: number; claimedAt?: string | null; rules?: number },
  squad: Squad,
  now: Date,
): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const encounters = encountersFor(run);
  legs(run).forEach((leg, index) => {
    const rand = seedOf(run.id, index, 2);
    const pool = TRAIL[run.tier];
    const first = pick(pool, rand);
    let second = pick(pool, rand);
    if (second === first && pool.length > 1) second = pool[(pool.indexOf(first) + 1) % pool.length];
    entries.push({ at: at(leg, 0.3), leg: index, kind: "trail", text: fill(first, squad, rand) });
    const encounter = encounters.find((entry) => entry.leg === index);
    if (encounter) {
      entries.push({ at: encounter.at, leg: index, kind: "encounter", encounter: encounter.key, text: fill(ENCOUNTER_LINES[encounter.key], squad, rand) });
    }
    entries.push({ at: at(leg, 0.7), leg: index, kind: "trail", text: fill(second, squad, rand) });
    const last = index === run.forks;
    entries.push({
      at: leg.end,
      leg: index,
      kind: last ? "home" : "arrive",
      text: last ? "The squad is home and waiting to be collected." : arrivalLine(run.tier, index, fill("{name}", squad, rand)),
    });
  });
  const cutoff = run.claimedAt ? Number.POSITIVE_INFINITY : now.getTime();
  return entries.filter((entry) => entry.at.getTime() <= cutoff).sort((a, b) => a.at.getTime() - b.at.getTime());
}

/** The newest line, for the ping. */
export function latestJournalLine(
  run: Parameters<typeof journalFor>[0],
  squad: Squad,
  now: Date,
): string | null {
  const entries = journalFor(run, squad, now);
  return entries.length > 0 ? entries[entries.length - 1].text : null;
}

// === banter ==================================================================

const ROLE_BANTER: Record<string, string> = {
  Top: "{name} says take the long way; a Top never trusts a shortcut.",
  Jungle: "{name} knows a way round and will not shut up about it.",
  Mid: "{name} wants to push. {name} always wants to push.",
  Bot: "{name} is not going first, and says so.",
  Support: "{name} wants to camp, light a fire and wait for daylight.",
};

/**
 * One sentence about who is standing at this fork, or null for a squad
 * the tables have nothing to say about. Teammates first (it is the rarest
 * and the one the rally rule turns on), then ink, then a role picked from
 * the squad by the fork's seed so the same squad hears a different voice
 * at each fork.
 */
export function banterFor(tier: ExpeditionTierKey, index: number, squad: Squad, runId = 0): string | null {
  if (squad.length === 0) return null;
  const rand = seedOf(runId, index, 3);
  const byTeam = new Map<string, Squad>();
  for (const copy of squad) {
    const team = (copy.card?.teamName ?? "").trim();
    if (!team) continue;
    byTeam.set(team, [...(byTeam.get(team) ?? []), copy]);
  }
  const mates = [...byTeam.values()].find((group) => group.length >= 2);
  const roll = rand();
  if (mates && roll < 0.5) {
    return mates.length === 3
      ? `${mates[0].playerName}, ${mates[1].playerName} and ${mates[2].playerName} move like a roster. They have already decided, and they are waiting for you to catch up.`
      : `${mates[0].playerName} and ${mates[1].playerName} vouch for each other. Whatever they pick, they pick together.`;
  }
  const signed = squad.find((copy) => copy.signed);
  if (signed && roll < 0.65) return `${signed.playerName} mentions, not for the first time, that a signed card could call in a favour here.`;
  const foil = squad.find((copy) => copy.foil);
  if (foil && FORKS[tier][index]?.dark && roll < 0.8) return `${foil.playerName} is shining hard enough to light the way, if it comes to that.`;
  const member = pick(squad, rand);
  const line = ROLE_BANTER[member.role ?? ""];
  return line ? line.replaceAll("{name}", member.playerName) : null;
}
