// The trail journal: what a squad writes home between forks.
//
// A run used to be a countdown. Now it is a countdown with a story: two
// lines a leg from the trail, an arrival line as the squad reaches each
// checkpoint, and on some legs an ENCOUNTER — a beat with no decision in
// it that still changes the run. A merchant pays for what the squad has
// found so far. A stranded card from another player's lost run can be
// carried home for a bounty. A storm delays the run two hours. On a road
// (ROAD_RULES) there is more on the trail: a cache, a rival squad, a
// shrine, a relic hunter.
//
// Everything is DERIVED, nothing is stored: the lines and the encounters
// are seeded by the run's id and leg, so the page, the Discord ping and
// the claim all read the same journal from the same row without a write.
// The sweep applies a storm's delay when its hour arrives and records
// that it did (expedition_runs.encounters), and the claim applies the
// merchant's dollars, the stranded rescue and the road's beats; the
// journal itself never needs the database.
//
// Squad banter at a fork reads the same way: the fork's story line gains
// a sentence keyed on who is standing there — a Support wants to camp, a
// Jungle knows a way round, two teammates vouch for each other — so the
// same fork reads differently with a different squad.
//
// Two voices, by rulebook. A run stamped before ROAD_RULES keeps the
// pools it set out with (LEGACY_*): its journal is already half-written
// and half-quoted in Discord, and a rule change must not rewrite a story
// in progress. A run on the road draws from the wider pools, without
// repeating a line inside one run, and hears each role in its own voice.

import { mulberry32 } from "@/lib/expeditions/prng";
import { TRAIL_RULES } from "./queries";
import { EXPEDITION_TIERS, HARVEST_MERCHANT, MERCHANT_DOLLARS, type CardCopy, type ExpeditionTierKey } from "./config";
import { DROUGHT_CACHES, WATCH_GHOSTS, WATCH_RIVALS, WEATHERS, WEATHER_RULES, type WeatherKey } from "./weather";
import { COMPANY_RULES, EDGE_TITLE, ROAD_RULES, forkWindows, forksFor, type RoadRef, type RouteEncounter } from "./routes";
// The trail's numbers the rules page quotes live in forks.ts, which the
// browser may hold; re-exported so every caller keeps reading them here.
import { HUNTER_FRAGMENT_CHANCE, ROAD_ENCOUNTER_CHANCE } from "./forks";
export { HUNTER_FRAGMENT_CHANCE, ROAD_ENCOUNTER_CHANCE, STORM_HOURS, STRANDED_BOUNTY } from "./forks";
import { ARCHETYPE_RULES, EDGE_BIG, GANK_WIN_MULT, MERCHANT_DRAW, activeAbilities, edgeLine, traitsOf, type AbilityTraits } from "./archetypes";
import type { RoadCompany } from "./company";
import {
  LEGACY_TRAIL,
  LEGACY_ENCOUNTER_LINES,
  LEGACY_ROLE_BANTER,
  TRAIL,
  ROLE_TRAIL,
  SCOUTED_LINES,
  ARRIVAL_LINES,
  HOME_LINES,
  ENCOUNTER_LINES,
  RIVAL_NAMED_LINES,
  ALONE_LINES,
  CROSSING_LINES,
  GHOST_LINES,
  GHOST_STOOD_LINES,
  ROLE_BANTER,
  MATES_LINES,
  SIGNED_LINES,
  FOIL_LINES,
  WARNED_LINES,
  type EncounterKey,
} from "./journalLines";
export type { EncounterKey } from "./journalLines";

/** How often a leg carries an encounter at all — and on a road, where
 *  there is more to meet. */
export const ENCOUNTER_CHANCE = 0.35;
// ROAD_ENCOUNTER_CHANCE (a road's), STORM_HOURS, STRANDED_BOUNTY and
// HUNTER_FRAGMENT_CHANCE: forks.ts, re-exported above.
/** How often the squad beats a rival to the spot. */
export const RIVAL_WIN_CHANCE = 0.5;

export interface Encounter extends RouteEncounter {
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

type RunRef = {
  id: number;
  tier: ExpeditionTierKey;
  startedAt: string;
  resolvesAt: string;
  forks: number;
  claimedAt?: string | null;
  rules?: number;
  convoy?: number | null;
  /** The answers so far. A scout at one fork writes a line at the start
   *  of the next leg — the Jungle back from ahead, naming the place. */
  choices?: { index: number; choice: string }[];
  /** Who else was on the road (company.ts): the rivals met, the runs that
   *  met this one, the ghosts. Read by the server; a run handed over
   *  without it meets nobody by name. */
  company?: RoadCompany | null;
  /** The weather the run launched under (weather.ts), read by the server
   *  from its launch week. A run handed over without it walks in no
   *  weather. */
  weather?: WeatherKey | null;
  /** The road a campaign handed down (expedition_runs.road): one place
   *  key per checkpoint, the places the resolver, the fork prompt and the
   *  map all name. Null or absent for every run not on a campaign, which
   *  reads exactly as it did before the journal knew about campaigns:
   *  forksFor draws the same stream with or without it. */
  road?: string[] | null;
};

const onRoad = (run: Pick<RunRef, "rules">): boolean => (run.rules ?? 1) >= ROAD_RULES;

const roadOf = (run: RunRef): RoadRef => ({ runId: run.id, rules: run.rules ?? 1, convoy: run.convoy ?? null, forks: run.forks, places: run.road ?? null });

// === the machinery ===========================================================

/** What arriving at a checkpoint reads like: the fork's own title. */
function legacyArrivalLine(tier: ExpeditionTierKey, leg: number, name: string, road: RoadRef): string {
  const fork = forksFor(tier, road)[leg];
  if (!fork) return `${name} can see the way home from here.`;
  return `The squad reached ${fork.title.toLowerCase()}. ${name} is waiting on word.`;
}

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

/** A pool in a run's own order: shuffled once from the run's seed, so
 *  taking lines off the front never repeats one until the pool is spent. */
function shuffled<T>(items: T[], rand: () => number): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function fill(template: string, squad: Squad, rand: () => number): string {
  const member = squad.length > 0 ? pick(squad, rand) : null;
  return fillFor(template, member);
}

function fillFor(template: string, member: Squad[number] | null): string {
  return template
    .replaceAll("{name}", member?.playerName ?? "The squad")
    .replaceAll("{role}", member?.role ?? "lane");
}

const roleWord = (member: Pick<CardCopy, "role">): string => {
  const raw = (member.role ?? "").trim().toLowerCase();
  return Object.keys(ROLE_TRAIL).find((role) => role.toLowerCase() === raw) ?? "";
};

/**
 * The encounters a run carries, decided once from its id. An Exorcism
 * has none — nothing on the trail interrupts a rite — and a run from
 * before forks existed has no legs to carry them.
 *
 * `traits` are the squad's edges that change what the road IS
 * (archetypes.ts), read under ARCHETYPE_RULES only: a Speedrunner or a
 * Tempo Setter is never held by a storm, First Blood Merchant draws the
 * merchant MERCHANT_DRAW times as often, and with Roam Enjoyer every relic
 * hunter has a fragment. Each bends a leg AFTER that leg's own draws, so the
 * beat is drawn exactly as it always was and only then bent — and none of
 * them touches a rival's leg or a ghost's, which are other collectors' runs
 * and graves that company.ts reads without this squad in hand. The page,
 * the sweep and the claim each hold the squad, so each passes the same
 * traits and all three meet the same road.
 */
export function encountersFor(
  run: { id: number; tier: ExpeditionTierKey; startedAt: string; resolvesAt: string; forks: number; rules?: number; convoy?: number | null },
  company?: RoadCompany | null,
  weather?: WeatherKey | null,
  traits?: AbilityTraits | null,
): Encounter[] {
  // A run that launched before the trail existed meets nothing on it: its
  // clock, its payout and its squad are exactly what it set out with.
  if (run.rules !== undefined && run.rules < TRAIL_RULES) return [];
  if (run.tier === "exorcism" || run.forks === 0) return [];
  const road = onRoad(run);
  const withCompany = (run.rules ?? 1) >= COMPANY_RULES;
  // The weather weights the draw (WEATHER_RULES): more caches in a
  // Drought, rivals on every road and ghosts in daylight under the Watch.
  const sky = (run.rules ?? 1) >= WEATHER_RULES ? weather ?? null : null;
  const edges = traits && (run.rules ?? 1) >= ARCHETYPE_RULES ? traits : null;
  const out: Encounter[] = [];
  legs(run).forEach((leg, index) => {
    const rand = seedOf(run.id, index, 1);
    if (rand() >= (road ? ROAD_ENCOUNTER_CHANCE : ENCOUNTER_CHANCE)) return;
    // Stranded cards only turn up on routes that can lose one — that is
    // where the lost are.
    // A convoy rides one clock for two squads: a storm on one run would
    // pull the forks apart, so convoys meet everything but weather.
    const keys: EncounterKey[] = run.convoy ? ["merchant"] : ["merchant", "storm"];
    if (road) keys.push("cache", "rival", "shrine", "hunter");
    if (EXPEDITION_TIERS[run.tier].risk === "lost" || EXPEDITION_TIERS[run.tier].risk === "dead") keys.push("stranded");
    // The dead walk the Legend and Legendary roads — from COMPANY_RULES,
    // so a run already out keeps the beats its journal has shown.
    if (withCompany && (run.tier === "legend" || run.tier === "legendary" || run.tier === "mythic")) keys.push("ghost");
    if (sky === "drought" && road) for (let extra = 1; extra < DROUGHT_CACHES; extra += 1) keys.push("cache");
    if (sky === "watch" && road) {
      for (let extra = 1; extra < WATCH_RIVALS; extra += 1) keys.push("rival");
      if (keys.includes("ghost")) for (let extra = 1; extra < WATCH_GHOSTS; extra += 1) keys.push("ghost");
    }
    const key = pick(keys, rand);
    let encounter: Encounter = { leg: index, key, at: at(leg, 0.5) };
    // The coin is tossed here, once, so the journal can say how it landed
    // hours before the claim reads it.
    if (key === "rival") encounter.won = rand() < RIVAL_WIN_CHANCE;
    if (key === "hunter") encounter.found = rand() < HUNTER_FRAGMENT_CHANCE;
    if (edges) {
      // First Blood Merchant: one more draw, the leg's last, turns a beat
      // that is nobody's into the merchant — at the chance that makes the
      // merchant's share of the leg's beats exactly MERCHANT_DRAW times
      // what it was. A rival and a ghost are never turned.
      const merchants = keys.filter((entry) => entry === "merchant").length;
      const others = keys.filter((entry) => entry !== "merchant" && entry !== "rival" && entry !== "ghost").length;
      if (edges.merchantDraw && others > 0 && key !== "merchant" && key !== "rival" && key !== "ghost") {
        const chance = Math.min(1, ((MERCHANT_DRAW - 1) * merchants) / others);
        if (chance >= 1 || (chance > 0 && rand() < chance)) encounter = { leg: index, key: "merchant", at: encounter.at };
      }
      // Roam Enjoyer: the hunter always has something to trade.
      if (edges.hunterFinds && encounter.key === "hunter") encounter.found = true;
      // A Speedrunner or a Tempo Setter is past the storm before it breaks.
      if (edges.stormproof && encounter.key === "storm") return;
    }
    out.push(encounter);
  });
  // The company, read over the coins: a real rival's verdict is shine's,
  // a road with nobody on it holds a cache, a ghost has a name — and a
  // ghost draw with nobody in the graveyard yet is a cache too.
  if (withCompany && company) {
    for (const encounter of out) {
      if (encounter.key === "rival") {
        const rival = company.rivals.find((meet) => meet.leg === encounter.leg);
        if (rival) {
          encounter.won = rival.won;
          encounter.rivalName = rival.name;
        } else {
          encounter.alone = true;
        }
      } else if (encounter.key === "ghost") {
        const ghost = company.ghosts.find((meet) => meet.leg === encounter.leg);
        if (ghost) encounter.ghost = { name: ghost.cardName, owner: ghost.name, team: ghost.team, stood: ghost.stood };
        else encounter.key = "cache";
      }
    }
  }
  return out;
}

/**
 * Every journal line written so far, oldest first. `now` gates them: a
 * line the squad has not reached yet is not written yet, which is what
 * makes the page worth coming back to.
 */
export function journalFor(run: RunRef, squad: Squad, now: Date): JournalEntry[] {
  const entries = onRoad(run) ? roadJournal(run, squad) : legacyJournal(run, squad);
  const cutoff = run.claimedAt ? Number.POSITIVE_INFINITY : now.getTime();
  return entries.filter((entry) => entry.at.getTime() <= cutoff).sort((a, b) => a.at.getTime() - b.at.getTime());
}

function legacyJournal(run: RunRef, squad: Squad): JournalEntry[] {
  const entries: JournalEntry[] = [];
  const encounters = encountersFor(run);
  const road = roadOf(run);
  legs(run).forEach((leg, index) => {
    const rand = seedOf(run.id, index, 2);
    const pool = LEGACY_TRAIL[run.tier];
    const first = pick(pool, rand);
    let second = pick(pool, rand);
    if (second === first && pool.length > 1) second = pool[(pool.indexOf(first) + 1) % pool.length];
    entries.push({ at: at(leg, 0.3), leg: index, kind: "trail", text: fill(first, squad, rand) });
    const encounter = encounters.find((entry) => entry.leg === index);
    if (encounter) {
      entries.push({ at: encounter.at, leg: index, kind: "encounter", encounter: encounter.key, text: fill(LEGACY_ENCOUNTER_LINES[encounter.key], squad, rand) });
    }
    entries.push({ at: at(leg, 0.7), leg: index, kind: "trail", text: fill(second, squad, rand) });
    const last = index === run.forks;
    entries.push({
      at: leg.end,
      leg: index,
      kind: last ? "home" : "arrive",
      text: last ? "The squad is home and waiting to be collected." : legacyArrivalLine(run.tier, index, fill("{name}", squad, rand), road),
    });
  });
  return entries;
}

/**
 * The road's journal. One line a leg from the route's own pool and one
 * from a squad member's role, each pool shuffled once for the run and
 * taken in order, so nothing repeats until a pool runs dry — and a
 * different squad on the same road hears different voices, because the
 * role lines are the roles it actually fielded.
 */
function roadJournal(run: RunRef, squad: Squad): JournalEntry[] {
  const entries: JournalEntry[] = [];
  // The squad's edges (archetypes.ts), under ARCHETYPE_RULES: the traits
  // the claim and the sweep read off the same squad, and the titles whose
  // edges the encounter lines owe a word to.
  const edged = (run.rules ?? 1) >= ARCHETYPE_RULES;
  const encounters = encountersFor(run, run.company, run.weather, edged ? traitsOf(squad, run.rules ?? 1) : null);
  const counted = new Map(edged ? activeAbilities(squad).map((entry) => [entry.ability.title, entry.copyId] as const) : []);
  // The sky, first: the week's weather is the first thing the squad sees.
  const sky = (run.rules ?? 1) >= WEATHER_RULES && run.weather ? WEATHERS[run.weather] : null;
  const firstLeg = legs(run)[0];
  if (sky && firstLeg) entries.push({ at: at(firstLeg, 0.05), leg: 0, kind: "trail", text: sky.sky });
  // Then the squad's edges, named once, the ignored ones as what they are.
  const edgeSaid = edged ? edgeLine(squad) : null;
  if (edgeSaid && firstLeg) entries.push({ at: at(firstLeg, 0.08), leg: 0, kind: "trail", text: edgeSaid });
  const road = roadOf(run);
  const forks = forksFor(run.tier, road);
  const trail = shuffled(TRAIL[run.tier], seedOf(run.id, 0, 4));
  const byRole = new Map<string, string[]>();
  const spoken = new Set<string>();
  const roled = squad.filter((member) => roleWord(member) !== "");
  let trailAt = 0;
  legs(run).forEach((leg, index) => {
    const rand = seedOf(run.id, index, 2);
    // The route's line first, then a role's. On an odd leg the order
    // flips, so the journal does not read as a metronome.
    const route = trail.length > 0 ? trail[trailAt++ % trail.length] : "";
    const member = roled.length > 0 ? pick(roled, rand) : squad.length > 0 ? pick(squad, rand) : null;
    const role = member ? roleWord(member) : "";
    let voice = "";
    if (member && role) {
      if (!byRole.has(role)) byRole.set(role, shuffled(ROLE_TRAIL[role], seedOf(run.id, Object.keys(ROLE_TRAIL).indexOf(role), 6)));
      const pool = byRole.get(role)!;
      const line = pool.find((candidate) => !spoken.has(candidate)) ?? pool[index % pool.length];
      spoken.add(line);
      voice = fillFor(line, member);
    }
    const routeLine = fill(route, squad, rand);
    const [firstLine, secondLine] = index % 2 === 0 ? [routeLine, voice || routeLine] : [voice || routeLine, routeLine];
    // A scout at the fork just behind: the Jungle names the place ahead
    // at the start of the leg, hours before the squad reaches it.
    const scoutedBehind = index > 0 && (run.choices ?? []).some((entry) => entry.index === index - 1 && entry.choice === "scout");
    const ahead = forks[index];
    if (scoutedBehind && ahead) {
      const jungle = squad.find((member) => roleWord(member) === "Jungle") ?? null;
      entries.push({ at: at(leg, 0.12), leg: index, kind: "trail", text: fillFor(pick(SCOUTED_LINES, rand).replaceAll("{title}", ahead.title.toLowerCase()), jungle) });
    }
    entries.push({ at: at(leg, 0.3), leg: index, kind: "trail", text: firstLine });
    const encounter = encounters.find((entry) => entry.leg === index);
    if (encounter) {
      const lines = ENCOUNTER_LINES[encounter.key];
      // The rival's and the hunter's lines come in pairs: the first two
      // for a win or a find, the last two otherwise. A named rival, an
      // empty road and a named ghost have pools of their own.
      const options =
        encounter.key === "rival" && encounter.alone ? ALONE_LINES
        : encounter.key === "rival" && encounter.rivalName ? (encounter.won ? RIVAL_NAMED_LINES.won : RIVAL_NAMED_LINES.lost)
        : encounter.key === "rival" ? (encounter.won ? lines.slice(0, 2) : lines.slice(2))
        : encounter.key === "hunter" ? (encounter.found ? lines.slice(0, 2) : lines.slice(2))
        : encounter.key === "ghost" && encounter.ghost ? (encounter.ghost.stood ? GHOST_STOOD_LINES : GHOST_LINES)
        : lines;
      const mate = encounter.ghost?.team ? squad.find((member) => member.card?.teamName === encounter.ghost!.team) ?? null : null;
      // Gold Hoarder pays Harvest prices in any weather — never more, so a
      // Harvest merchant reads the same with it or without.
      const hoarded = encounter.key === "merchant" && sky?.key !== "harvest" && counted.has(EDGE_TITLE.goldHoarder);
      const named = (sky?.key === "harvest" && encounter.key === "merchant"
        ? `${pick(options, rand).replace(String(MERCHANT_DOLLARS), String(MERCHANT_DOLLARS * HARVEST_MERCHANT))} Harvest prices.`
        : hoarded
          ? `${pick(options, rand).replace(String(MERCHANT_DOLLARS), String(MERCHANT_DOLLARS * HARVEST_MERCHANT))} ${EDGE_TITLE.goldHoarder}: ${nameIn(squad, counted.get(EDGE_TITLE.goldHoarder))} would take nothing under Harvest prices.`
          : pick(options, rand))
        .replaceAll("{rival}", encounter.rivalName ?? "Another collector")
        .replaceAll("{ghost}", encounter.ghost?.name ?? "something")
        .replaceAll("{owner}", encounter.ghost?.owner ?? "Somebody")
        .replaceAll("{mate}", mate?.playerName ?? "the squad");
      entries.push({ at: encounter.at, leg: index, kind: "encounter", encounter: encounter.key, text: `${fill(named, squad, rand)}${edgeNote(encounter, counted, squad)}` });
    }
    entries.push({ at: at(leg, 0.7), leg: index, kind: "trail", text: secondLine });
    const last = index === run.forks;
    const fork = forks[index];
    entries.push({
      at: leg.end,
      leg: index,
      kind: last ? "home" : "arrive",
      text: last
        ? pick(HOME_LINES, rand)
        : fork
          ? fill(pick(ARRIVAL_LINES, rand).replaceAll("{title}", fork.title.toLowerCase()), squad, rand)
          : fill("{name} can see the way home from here.", squad, rand),
    });
  });
  // The other side of every meet: a run that picked this squad as its
  // rival writes the crossing here too, at the hour it happened.
  const runLegs = legs(run);
  for (const crossing of run.company?.crossings ?? []) {
    const when = new Date(crossing.at);
    const legIndex = Math.max(0, runLegs.findIndex((leg) => when.getTime() >= leg.start.getTime() && when.getTime() < leg.end.getTime()));
    const rand = seedOf(run.id, legIndex, 8 + crossing.runId % 97);
    const line = pick(crossing.won ? CROSSING_LINES.won : CROSSING_LINES.lost, rand).replaceAll("{rival}", crossing.name);
    entries.push({ at: when, leg: legIndex, kind: "encounter", encounter: "rival", text: fill(line, squad, rand) });
  }
  return entries;
}

/** A squad member's name by copy id, for an edge's word. */
function nameIn(squad: Squad, id: number | undefined): string {
  return squad.find((member) => member.id === id)?.playerName ?? "The squad";
}

/**
 * What the squad's edges add to an encounter's line, under ARCHETYPE_RULES:
 * the resolver pays a rival edge and a ghost edge at the claim, so the
 * journal says so here rather than quote a number the claim will not pay.
 * Appended after the line is drawn and filled, never drawn itself, so the
 * line under it is the one it always was. Empty for everything else.
 */
function edgeNote(encounter: Encounter, counted: Map<string, number>, squad: Squad): string {
  const who = (title: string) => nameIn(squad, counted.get(title));
  const pct = (n: number) => Math.round(n * 100);
  const notes: string[] = [];
  if (encounter.key === "rival" && !encounter.alone) {
    if (encounter.won && counted.has(EDGE_TITLE.gank)) notes.push(`${EDGE_TITLE.gank}: ${who(EDGE_TITLE.gank)} made them pay for it — the win pays ${GANK_WIN_MULT === 2 ? "double" : `${GANK_WIN_MULT} times over`}.`);
    if (!encounter.won && counted.has(EDGE_TITLE.bornWinner)) notes.push(`${EDGE_TITLE.bornWinner}: ${who(EDGE_TITLE.bornWinner)} will not hear of losing — it costs the squad nothing.`);
    if (counted.has(EDGE_TITLE.campThief)) notes.push(`${EDGE_TITLE.campThief}: ${who(EDGE_TITLE.campThief)} took their cache anyway, ${pct(EDGE_BIG)}% more.`);
  }
  if (encounter.key === "ghost" && encounter.ghost && !encounter.ghost.stood) {
    if (counted.has(EDGE_TITLE.counterJungler)) notes.push(`${EDGE_TITLE.counterJungler}: ${who(EDGE_TITLE.counterJungler)} found the cache it was keeping, ${pct(EDGE_BIG)}% more — and the haunting will not double.`);
    if (counted.has(EDGE_TITLE.visionDenier)) notes.push(`${EDGE_TITLE.visionDenier}: ${who(EDGE_TITLE.visionDenier)} keeps it at the edge of the light — the haunting will not double.`);
  }
  return notes.map((note) => ` ${note}`).join("");
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

/**
 * One sentence about who is standing at this fork, or null for a squad
 * the tables have nothing to say about. Teammates first (it is the rarest
 * and the one the rally rule turns on), then ink, then a role picked from
 * the squad by the fork's seed so the same squad hears a different voice
 * at each fork. On a road the pools are wider, the fork's own mood gets a
 * word (a warned fork is dreaded out loud), and each role speaks in its
 * own voice — from several lines, not one.
 */
export function banterFor(tier: ExpeditionTierKey, index: number, squad: Squad, runId = 0, road?: RoadRef | null): string | null {
  if (squad.length === 0) return null;
  const rand = seedOf(runId, index, 3);
  const wide = Boolean(road && road.rules >= ROAD_RULES);
  const fork = forksFor(tier, road)[index];
  const byTeam = new Map<string, Squad>();
  for (const copy of squad) {
    const team = (copy.card?.teamName ?? "").trim();
    if (!team) continue;
    byTeam.set(team, [...(byTeam.get(team) ?? []), copy]);
  }
  const mates = [...byTeam.values()].find((group) => group.length >= 2);
  const roll = rand();
  if (mates && roll < 0.5) {
    if (mates.length === 3) {
      const line = wide ? pick(MATES_LINES.three, rand) : MATES_LINES.three[0];
      return line.replaceAll("{a}", mates[0].playerName).replaceAll("{b}", mates[1].playerName).replaceAll("{c}", mates[2].playerName);
    }
    const line = wide ? pick(MATES_LINES.two, rand) : MATES_LINES.two[0];
    return line.replaceAll("{a}", mates[0].playerName).replaceAll("{b}", mates[1].playerName);
  }
  const signed = squad.find((copy) => copy.signed);
  if (signed && roll < 0.65) return fillFor(wide ? pick(SIGNED_LINES, rand) : SIGNED_LINES[0], signed);
  const foil = squad.find((copy) => copy.foil);
  if (foil && fork?.dark && roll < 0.8) return fillFor(wide ? pick(FOIL_LINES, rand) : FOIL_LINES[0], foil);
  const member = pick(squad, rand);
  if (!wide) {
    const line = LEGACY_ROLE_BANTER[member.role ?? ""];
    return line ? line.replaceAll("{name}", member.playerName) : null;
  }
  // The fork's own mood, sometimes: a warned fork is dreaded out loud by
  // whoever is nearest.
  if (fork?.warned && rand() < 0.35) return fillFor(pick(WARNED_LINES, rand), member);
  const role = roleWord(member);
  const lines = role ? ROLE_BANTER[role] : null;
  return lines ? fillFor(pick(lines, rand), member) : null;
}
