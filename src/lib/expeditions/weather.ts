// The weather: one league-wide condition a week, seeded from the Eastern
// Monday, that changes which squad is right to send THIS week without
// touching a single odds table. Posted with the brief on the board and in
// the Monday drop. A run keeps the weather it launched under — derived
// from its launch week, never stored — so the page, the ping and the
// claim agree, and a squad in the field is never rained on after the fact.
//
//   Fog      every fork is dark: foils and lights matter everywhere.
//   Drought  the scouting coin flip pays less; caches twice as common.
//   Harvest  merchants pay double, and tolls are waived.
//   The Watch  playoff weeks only: rivals on every road, tolls doubled,
//              ghosts walk in daylight.
//   Clear    nothing, on purpose. Some weeks the road is just the road.
//
// From WEATHER_RULES: a run stamped below it launched into no weather at
// all, because its journal is half written.

import { mulberry32 } from "@/lib/gauntlet/sim";
import { mondayOf } from "@/lib/packs/week";
import { HARVEST_MERCHANT, MERCHANT_DOLLARS } from "./config";

/** The rulebook version from which a run launches under the weather. */
export const WEATHER_RULES = 5;

export type WeatherKey = "clear" | "fog" | "drought" | "harvest" | "watch";

export interface Weather {
  key: WeatherKey;
  label: string;
  glyph: string;
  /** The journal's first line of the run, and the banner's. */
  sky: string;
  /** What it does, in the rules' words. */
  does: string[];
}

/** Under a Drought the scouting gamble's win pays this much of its bonus. */
export const DROUGHT_GAMBLE = 0.5;
/** Under a Drought a cache is this many times as likely to be the beat. */
export const DROUGHT_CACHES = 2;
/** Under the Watch a toll costs this many times TOLL_LOOT. */
export const WATCH_TOLL = 2;
/** Under the Watch a rival is this many times as likely to be the beat. */
export const WATCH_RIVALS = 3;
/** Under the Watch a ghost is this many times as likely to be the beat. */
export const WATCH_GHOSTS = 2;

const pct = (n: number) => `${Math.round(n * 100)}%`;

export const WEATHERS: Record<WeatherKey, Weather> = {
  clear: {
    key: "clear",
    label: "Clear",
    glyph: "☀",
    sky: "Clear skies over the road. It is just the road this week.",
    does: ["Nothing. Some weeks the road is just the road."],
  },
  fog: {
    key: "fog",
    label: "Fog",
    glyph: "🌫",
    sky: "Fog on the road, thick enough to lose the squad in. Every fork is dark this week.",
    does: ["Every fork is dark: a foil can light the way at any of them, and the Bot's kite and the Support's ward are worth more than usual."],
  },
  drought: {
    key: "drought",
    label: "Drought",
    glyph: "🌵",
    sky: "Drought. The riverbeds are dry, the camps are empty, and old caches are showing through the dust.",
    does: [`The scouting run's coin flip pays ${pct(DROUGHT_GAMBLE)} of its bonus.`, `Caches are ${DROUGHT_CACHES}× as common on every road.`],
  },
  harvest: {
    key: "harvest",
    label: "Harvest",
    glyph: "🌾",
    sky: "Harvest week. Every merchant on the road is paying over the odds, and the toll keepers have gone to the fields.",
    does: [`Merchants pay ${HARVEST_MERCHANT}× — ${MERCHANT_DOLLARS * HARVEST_MERCHANT} instead of ${MERCHANT_DOLLARS}.`, "Tolls are waived at every gate."],
  },
  watch: {
    key: "watch",
    label: "The Watch",
    glyph: "👁",
    sky: "The Watch is out. Playoff week: every road is crowded, every gate is guarded, and the dead do not wait for dark.",
    does: [`Rivals on every road: a rival squad is ${WATCH_RIVALS}× as likely to be the beat.`, `Tolls cost ${WATCH_TOLL}× — every gate is guarded.`, `Ghosts walk in daylight: ${WATCH_GHOSTS}× as likely on the Legend and Legendary roads.`, "Only ever in a playoff week."],
  },
};

/** The draw for an ordinary week. Clear a third of the time, on purpose. */
const DRAW: WeatherKey[] = ["clear", "clear", "clear", "fog", "fog", "drought", "drought", "harvest", "harvest"];

function hashWeek(weekStart: string): number {
  let hash = 2166136261;
  for (let i = 0; i < weekStart.length; i += 1) {
    hash ^= weekStart.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

/** The week's weather: the Watch in a playoff week, otherwise drawn from
 *  the Monday's date and nothing else. */
export function weatherForWeek(weekStart: string, watch = false): Weather {
  if (watch) return WEATHERS.watch;
  const rand = mulberry32((hashWeek(weekStart) + 13) >>> 0);
  return WEATHERS[DRAW[Math.min(DRAW.length - 1, Math.floor(rand() * DRAW.length))]];
}

/** The fixture stages that make a week a playoff week. */
export const PLAYOFF_STAGES = new Set(["quarterfinals", "semifinals", "finals"]);

/** The Eastern weeks (Monday, YYYY-MM-DD) that hold a playoff fixture. */
export function watchWeeksOf(fixtures: { scheduled_at: string | null; stage?: string | null }[]): Set<string> {
  const weeks = new Set<string>();
  for (const fixture of fixtures) {
    if (!fixture.scheduled_at || !fixture.stage || !PLAYOFF_STAGES.has(fixture.stage)) continue;
    weeks.add(mondayOf(new Date(fixture.scheduled_at)));
  }
  return weeks;
}

/** The weather a run launched under, or null below WEATHER_RULES. */
export function weatherOfRun(run: { startedAt: string; rules: number }, watchWeeks: ReadonlySet<string> = new Set()): Weather | null {
  if (run.rules < WEATHER_RULES) return null;
  const week = mondayOf(new Date(run.startedAt));
  return weatherForWeek(week, watchWeeks.has(week));
}

/** This week's, for the banner and the Monday drop. */
export function weatherNow(now: Date, watchWeeks: ReadonlySet<string> = new Set()): Weather {
  const week = mondayOf(now);
  return weatherForWeek(week, watchWeeks.has(week));
}

/** "🌫 Fog — every fork is dark…", for Discord. */
export function weatherLine(weather: Weather): string {
  return `${weather.glyph} ${weather.label} — ${weather.sky}`;
}
