// Runs in the field, as the living map sees them, without a database: six
// moments of a run (spec §6.2) on the Legend Hunt and the Mythic route,
// and a fresh run on each of the other six routes so every terrain can be
// looked at.
//
//   fresh     just launched: the squad knows the first stops, the rest is `?`
//   mid       halfway down a leg: journal pins, a rival met, a convoy
//   fork      at a fork, waiting on an answer
//   fog       a Fog week: two unknown stops, the squad dreading one
//   storm     the Watch is out and a storm has the squad pinned down
//   finished  home: every stop known, a landmark named
//
// Pure data at fixed instants, so the jsdom tests, the staff preview at
// /admin/expedition-map and the Playwright screenshots all look at the same
// charts. The places are real ones from the roads (mapFixtures.test.ts
// holds each key and title to ROADS), and like a real RunView an unknown
// place carries no key and no title. Nothing here is read by a live page.

import type { ExpeditionTierKey } from "./config";
import type { ForkChoice, ForkStatus } from "./forks";
import type { EncounterKey } from "./journal";
import type { LeagueGoalKind } from "./league";
import type { RevealedBy } from "./reveal";
import type { EdgeView, GhostView, JournalLineView, KnownPlaceView, PlaceView, RivalView, RunView, StormView, UnknownPlaceView } from "./views";
import { WEATHERS, type WeatherKey } from "./weather";

export type MapState = "fresh" | "mid" | "fork" | "fog" | "storm" | "finished";

export const MAP_STATES: MapState[] = ["fresh", "mid", "fork", "fog", "storm", "finished"];

export const MAP_STATE_LABELS: Record<MapState, string> = {
  fresh: "Fresh run",
  mid: "Mid-leg",
  fork: "Fork open",
  fog: "Fog and unknowns",
  storm: "Storm under the Watch",
  finished: "Finished",
};

/** The two routes every moment is drawn on. */
export const MAP_FULL_TIERS: ExpeditionTierKey[] = ["legend", "mythic"];

/** Every route, in the board's order. */
export const MAP_TIERS: ExpeditionTierKey[] = ["scout", "gilded", "raid", "legend", "rescue", "exorcism", "legendary", "mythic"];

export function isMapState(value: unknown): value is MapState {
  return typeof value === "string" && (MAP_STATES as string[]).includes(value);
}

export function isMapTier(value: unknown): value is ExpeditionTierKey {
  return typeof value === "string" && (MAP_TIERS as string[]).includes(value);
}

/** The charts the preview draws: every moment on the two full routes,
 *  then a fresh run on each of the others. */
export const MAP_FIXTURE_KEYS: { state: MapState; tier: ExpeditionTierKey }[] = [
  ...MAP_FULL_TIERS.flatMap((tier) => MAP_STATES.map((state) => ({ state, tier }))),
  ...MAP_TIERS.filter((tier) => !MAP_FULL_TIERS.includes(tier)).map((tier) => ({ state: "fresh" as const, tier })),
];

/** The league's goal of the week as the map draws it (LivingMap's MapGoal). */
export interface FixtureGoal {
  kind: LeagueGoalKind;
  title: string;
  done: number;
  target: number;
  unit: "miles" | "pushes";
}

export interface MapFixture {
  state: MapState;
  tier: ExpeditionTierKey;
  view: RunView;
  /** The board's clock, as a fraction of the run. */
  progress: number;
  convoy: { partner: string | null } | null;
  goal: FixtureGoal | null;
}

// === the roads the fixtures walk ============================================

interface FixturePlace {
  key: string;
  title: string;
  warned: boolean;
  dark: boolean;
  toll: boolean;
}

const place = (key: string, title: string, flags: Partial<Pick<FixturePlace, "warned" | "dark" | "toll">> = {}): FixturePlace => ({
  key,
  title,
  warned: flags.warned ?? false,
  dark: flags.dark ?? false,
  toll: flags.toll ?? false,
});

/** One drawn road per route: an entry from each slot of ROADS. */
export const FIXTURE_ROADS: Record<ExpeditionTierKey, FixturePlace[]> = {
  scout: [place("riverbed", "The dry riverbed")],
  gilded: [place("toll", "The toll bridge", { toll: true }), place("lanterns", "The lantern market", { dark: true })],
  raid: [place("waterworks", "The flooded works"), place("ridge", "The brutal fork", { dark: true })],
  legend: [place("chapel", "The drowned chapel", { dark: true }), place("belltower", "The bell tower", { dark: true }), place("vault", "The vault door", { warned: true })],
  rescue: [place("crossing", "The river crossing", { dark: true })],
  exorcism: [],
  legendary: [
    place("threshold", "The threshold", { dark: true }),
    place("mirrors", "The mirror hall", { warned: true, dark: true }),
    place("tide", "The tide"),
    place("table", "The last table", { warned: true }),
  ],
  mythic: [
    place("stairwell", "The stairwell of hours", { warned: true, dark: true }),
    place("orrery", "The orrery", { warned: true, dark: true }),
    place("cathedral", "The cathedral of teeth", { warned: true, dark: true }),
    place("eclipse", "The eclipse", { warned: true, dark: true }),
    place("lastdoor", "The last door", { warned: true, dark: true, toll: true }),
  ],
};

const HOURS: Record<ExpeditionTierKey, number> = { scout: 8, gilded: 48, raid: 24, legend: 48, rescue: 12, exorcism: 8, legendary: 72, mythic: 96 };

/** Launched Monday 9 AM ET. */
const START = Date.parse("2026-09-21T13:00:00.000Z");
const HOUR = 3_600_000;

// === the squad's words ======================================================

const TRAIL: Record<ExpeditionTierKey, string[]> = {
  scout: ["Kai found tracks at the riverbed. Fresh, and heading upstream.", "A milestone with the distance scratched out. Mira scratched a new one in."],
  gilded: ["Lamps lit all the way along the road, and nobody lighting them. Dex counted forty.", "A carriage passed going the other way. Mira bowed; it did not."],
  raid: ["The pipes under the road are still warm. Dex will not say why he knows that.", "Kai marked the way out on every third pylon, just in case."],
  legend: [
    "The mine shaft breathes warm air. Kai dropped a stone in and never heard it land.",
    "They found the old expedition's marks on a wall. The last one is unfinished.",
    "Cold. Mira is rationing the light.",
    "Dex swears something is walking alongside the squad just past the torchlight.",
    "The squad shared a fire. Kai told the story of the vault, badly.",
    "A checkpoint nobody built. Mira does not want to camp here and says so, twice.",
  ],
  rescue: ["Kai has the ransom note folded in a boot and will not stop checking it.", "Smoke on the far bank. Mira thinks that is them."],
  exorcism: ["The priest walks ahead and does not look back. Dex carries the salt.", "The haunted card is heavier than it was this morning."],
  legendary: ["The stair goes down and then, somehow, up. Mira has stopped counting.", "No wind, and the torches lean anyway.", "Kai heard their own name from the dark and did not answer it."],
  mythic: [
    "The road past the rift. Kai has been here before, and it remembers them.",
    "Nothing here casts a shadow but the squad.",
    "The stars are wrong. Mira is drawing them anyway, for whoever comes next.",
    "Dex keeps a hand on the wall. The wall keeps a hand on Dex.",
    "An hour went by twice. Everyone agrees not to mention it.",
    "The squad passed its own footprints, going the other way.",
    "Mira says the air tastes of coins.",
    "Something counted them as they went by, and got the number right.",
  ],
};

const ARRIVALS = ["The squad reached {title}. Kai is waiting on word.", "The squad is at {title}. Nobody moves until you say.", "Mira was first to {title} and is the first to ask what happens now."];

const ENCOUNTER_TEXT: Record<EncounterKey, string> = {
  merchant: "A merchant with a cart and no hurry. $120 for what the squad had found so far, and Dex made them count it twice.",
  cache: "A cache somebody meant to come back for and never did. 20% more loot, and Mira left the cairn as it was.",
  rival: "Dray's squad on the same trail, going the same way. Yours got there first: 15% more in the bag, and Kai waved.",
  storm: "Weather, all at once. The squad found a wall to stand behind and lost 2 hours to it.",
  ghost: "Footsteps in step with the squad's all afternoon, and Mira finally looked: Old Vex, that fell here on Harlan's run. It is heading for the same fork.",
  shrine: "A shrine at the roadside, older than the road. Kai stopped at it. Whatever is at the next fork will find the squad harder to hurt.",
  hunter: "A relic hunter, going the other way, sold Dex a piece of a map. It is warm to the touch.",
  stranded: "Somebody else's lost card, alone on the trail and glad to see anyone. Kai picked it up without a word.",
};

const EDGE_LINE = "Kai's Unkillable, Mira's Gold Hoarder and Dex's Camp Thief ride with the squad — all three count.";

const EDGES: EdgeView[] = [
  { copyId: 101, title: "Unkillable", kind: "guard", does: "The first harm on this card is ignored.", counts: true },
  { copyId: 102, title: "Gold Hoarder", kind: "merchant", does: "Merchants pay Harvest prices.", counts: true },
  { copyId: 103, title: "Camp Thief", kind: "camp", does: "Camping here pays a little.", counts: true },
];

// === building a view =========================================================

interface Beat {
  /** Which leg, and how far into it (0..1). */
  leg: number;
  into: number;
  key: EncounterKey;
  text?: string;
}

interface Plan {
  weather: WeatherKey;
  /** The clock, as a fraction of the run. */
  progress: number;
  claimed?: boolean;
  /** Each checkpoint's state, in road order. */
  road: {
    status: ForkStatus;
    choice?: ForkChoice | null;
    known: RevealedBy | null;
    landmark?: KnownPlaceView["landmark"];
  }[];
  beats?: Beat[];
  rivals?: (Omit<RivalView, "at" | "fraction"> & { into: number })[];
  ghosts?: (Omit<GhostView, "at" | "fraction"> & { into: number })[];
  storms?: { leg: number; into: number }[];
  convoy?: { partner: string | null } | null;
  goal?: FixtureGoal | null;
}

const iso = (ms: number) => new Date(ms).toISOString();

function viewOf(tier: ExpeditionTierKey, plan: Plan): RunView {
  const places = FIXTURE_ROADS[tier];
  const span = HOURS[tier] * HOUR;
  const legs = places.length + 1;
  const at = (fraction: number) => START + fraction * span;
  const legAt = (leg: number, into: number) => (leg + into) / legs;
  const now = plan.claimed ? START + span + 2 * HOUR : at(plan.progress);
  const seen = (fraction: number) => plan.claimed === true || at(fraction) <= now;

  const road: PlaceView[] = places.map((entry, index): PlaceView => {
    const state = plan.road[index] ?? { status: "pending" as const, known: null };
    const fraction = (index + 1) / legs;
    const base = {
      index,
      at: fraction,
      opensAt: iso(at(fraction)),
      closesAt: iso(at((index + 2) / legs)),
      status: state.status,
      pushed: state.status === "decided" && state.choice !== null && state.choice !== undefined && state.choice !== "camp" && state.choice !== "hold",
    };
    if (state.known === null) {
      const unknown: UnknownPlaceView = { ...base, warned: entry.warned, dark: null, toll: null, known: false, mark: "?" };
      return unknown;
    }
    const known: KnownPlaceView = {
      ...base,
      warned: entry.warned,
      dark: entry.dark || plan.weather === "fog",
      toll: entry.toll,
      known: true,
      key: entry.key,
      title: entry.title,
      choice: state.status === "missed" ? "camp" : (state.choice ?? null),
      revealedBy: state.known,
      landmark: state.landmark ?? null,
    };
    return known;
  });

  // The journal: the sky and the edges first, then each leg's two trail
  // lines and its beat, and the arrival that ends it.
  const lines: (Omit<JournalLineView, "at"> & { atMs: number })[] = [];
  const push = (fraction: number, leg: number, kind: JournalLineView["kind"], text: string, encounter?: EncounterKey) => {
    if (!seen(fraction)) return;
    lines.push({ atMs: at(fraction), leg, kind, text, fraction, ...(encounter ? { encounter } : {}) });
  };
  push(legAt(0, 0.05), 0, "trail", WEATHERS[plan.weather].sky);
  push(legAt(0, 0.08), 0, "trail", EDGE_LINE);
  const pool = TRAIL[tier];
  let said = 0;
  for (let leg = 0; leg < legs; leg += 1) {
    push(legAt(leg, 0.3), leg, "trail", pool[said++ % pool.length]);
    for (const beat of plan.beats ?? []) {
      if (beat.leg === leg) push(legAt(leg, beat.into), leg, "encounter", beat.text ?? ENCOUNTER_TEXT[beat.key], beat.key);
    }
    push(legAt(leg, 0.7), leg, "trail", pool[said++ % pool.length]);
    if (leg < places.length) {
      push(legAt(leg, 1), leg, "arrive", ARRIVALS[leg % ARRIVALS.length].replace("{title}", places[leg].title.toLowerCase()));
    } else {
      push(1, leg, "home", "Home. The squad is at the door with the bag, waiting on you.");
    }
  }
  lines.sort((a, b) => a.atMs - b.atMs);
  const journal: JournalLineView[] = lines.map(({ atMs, ...line }) => ({ at: iso(atMs), ...line }));

  const onRoad = <T extends { leg: number }>(entry: T) => entry.leg < legs;
  const rivals: RivalView[] = (plan.rivals ?? []).filter(onRoad).map(({ into, ...rival }) => ({ ...rival, fraction: legAt(rival.leg, into), at: iso(at(legAt(rival.leg, into))) }));
  const ghosts: GhostView[] = (plan.ghosts ?? []).filter(onRoad).map(({ into, ...ghost }) => ({ ...ghost, fraction: legAt(ghost.leg, into), at: iso(at(legAt(ghost.leg, into))) }));
  const storms: StormView[] = (plan.storms ?? []).filter(onRoad).map(({ leg, into }) => ({ leg, fraction: legAt(leg, into), at: iso(at(legAt(leg, into))), hours: 2 }));

  const open = road.find((entry) => entry.status === "open") ?? null;
  const openPlace = open ? places[open.index] : null;
  return {
    runId: 9000 + MAP_TIERS.indexOf(tier),
    tier,
    asOf: iso(now),
    startedAt: iso(START),
    resolvesAt: iso(START + span),
    weather: plan.weather,
    road,
    journal,
    nextAt: plan.claimed ? null : iso(now + HOUR),
    openFork:
      open && openPlace
        ? {
            index: open.index,
            key: openPlace.key,
            title: openPlace.title,
            story: `The squad has stopped at ${openPlace.title.toLowerCase()}.`,
            rivalStory: null,
            banter: null,
            options: [],
            opensAt: open.opensAt,
            closesAt: open.closesAt,
            last: open.index === places.length - 1,
          }
        : null,
    edges: EDGES,
    company: { rivals, ghosts },
    storms,
    reveal: null,
    tent: 0,
  };
}

// === the moments =============================================================

const known = (by: RevealedBy) => ({ status: "pending" as const, known: by });
const walked = (choice: ForkChoice) => ({ status: "decided" as const, choice, known: "walked" as const });
const unknown: Plan["road"][number] = { status: "pending", known: null };

/** The fraction a moment's clock stands at, on a road of `legs` legs. */
const on = (legs: number, leg: number, into: number) => (leg + into) / legs;

function plan(state: MapState, tier: ExpeditionTierKey): Plan {
  const n = FIXTURE_ROADS[tier].length;
  const legs = n + 1;
  type Stop = Plan["road"][number];
  const fill = (first: Stop[], rest: Stop): Stop[] => Array.from({ length: n }, (_, i) => first[i] ?? rest);
  switch (state) {
    case "fresh":
      // A Veteran in the squad knows the next two stops; the rest is fog.
      return { weather: "clear", progress: on(legs, 0, 0.14), road: fill([known("trail"), known("trail")], unknown) };
    case "mid":
      return {
        weather: "clear",
        progress: on(legs, 1, 0.62),
        road: fill([walked("push"), known("trail")], unknown),
        beats: [
          { leg: 0, into: 0.5, key: "merchant" },
          { leg: 1, into: 0.46, key: "rival" },
        ],
        rivals: [{ leg: 1, into: 0.46, name: "Dray", won: true, crossing: false }],
        convoy: { partner: "Wren" },
      };
    case "fork":
      return {
        weather: "clear",
        progress: on(legs, Math.min(2, n), 0.2),
        road: fill(n >= 2 ? [walked("camp"), { status: "open", known: "walked" }] : [{ status: "open", known: "walked" }], unknown),
        beats: [{ leg: 0, into: 0.55, key: "cache" }, ...(n >= 2 ? [{ leg: 1, into: 0.5, key: "ghost" as const }] : [])],
        ghosts: n >= 2 ? [{ leg: 1, into: 0.5, name: "Old Vex", owner: "Harlan", stood: false }] : [],
      };
    case "fog":
      // Two stops the squad cannot see ahead; on the Legend Hunt one of them
      // is the vault, which it dreads. (Every Mythic stop is dreaded.)
      return {
        weather: "fog",
        progress: tier === "mythic" ? on(legs, 2, 0.45) : on(legs, 1, 0.4),
        road: tier === "mythic" ? fill([walked("push"), walked("scout"), known("scout")], unknown) : fill([walked("push")], unknown),
        beats: [{ leg: 0, into: 0.5, key: "shrine" }],
      };
    case "storm":
      return {
        weather: "watch",
        progress: on(legs, 2, 0.62),
        road: fill([walked("push"), walked("push"), known("trail")], unknown),
        beats: [
          { leg: 1, into: 0.45, key: "rival" },
          { leg: 2, into: 0.3, key: "storm" },
          { leg: 2, into: 0.52, key: "rival", text: "Ossie's squad passed yours in the night and got to the spot first. Kai heard them laughing." },
        ],
        rivals: [
          { leg: 1, into: 0.45, name: "Dray", won: true, crossing: false },
          { leg: 2, into: 0.52, name: "Ossie", won: false, crossing: true },
        ],
        storms: [{ leg: 2, into: 0.3 }],
        goal: { kind: "boss", title: "The Wolves Colossus", done: 17, target: 24, unit: "pushes" },
      };
    case "finished":
      return {
        weather: "clear",
        progress: 1,
        claimed: true,
        road: fill(
          [
            { ...walked("push"), landmark: { by: "Marlow", mine: true, crest: true } },
            walked("camp"),
            { status: "missed", known: "walked" },
            walked("push"),
          ],
          walked("push"),
        ),
        beats: [
          { leg: 0, into: 0.5, key: "merchant" },
          { leg: 1, into: 0.45, key: "rival" },
          { leg: 2, into: 0.5, key: "ghost" },
        ],
        rivals: [{ leg: 1, into: 0.45, name: "Dray", won: true, crossing: false }],
        ghosts: [{ leg: 2, into: 0.5, name: "Old Vex", owner: "Harlan", stood: true }],
        goal: { kind: "landmark", title: "The Kings–Wolves Ridge", done: 31, target: 40, unit: "miles" },
      };
  }
}

/**
 * The chart for one moment on one route. A route too short for a moment
 * draws it as far as the road allows (a one-fork road has no second stop
 * to walk to; the Exorcism has no stops at all).
 */
export function mapFixture(state: MapState, tier: ExpeditionTierKey): MapFixture {
  const planned = plan(state, tier);
  // A moment planned for a long road, drawn on a short one, stops short of
  // home: only a claimed run stands at the door.
  const p = planned.claimed ? planned : { ...planned, progress: Math.min(planned.progress, 0.96) };
  const view = viewOf(tier, p);
  return { state, tier, view, progress: p.progress, convoy: p.convoy ?? null, goal: p.goal ?? null };
}
