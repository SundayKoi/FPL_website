// Three collectors for looking at the expedition board without a database:
// someone who has never sent a squad, someone mid-game with two runs out
// and a fork waiting, and a veteran with a lost card, graves, a campaign,
// a base camp, an atlas and a run already home. The two who have walked
// this week see the league goal part-way there.
//
// Pure data, relative to the `now` it is handed, so the jsdom tests, the
// staff preview at /admin/expedition-board and the Playwright screenshots
// all look at the same three boards. Nothing here is read by the live page.
//
// What each squad knows of its road (`views`) is derived the way the live
// page derives it — buildRunViews over the fixture's runs — so the preview
// shows real fog: the mid-game Deep Raid has a checkpoint ahead nobody has
// seen, the veteran's Legendary route two, one of them dreaded, and both
// can spend a fragment to see the rest. The atlas is built the same way,
// atlasFor over each persona's claimed runs and the league's landmarks:
// the mid-game raid stands at a place Ana reached first, and the veteran
// has walked the Scouting Run's whole road, is half-way down the Legend
// Hunt's and named the empty village. That makes this module server-only
// (views.ts and atlas.ts hold the road); the preview page is a server
// component, and the tests that read it stand `server-only` in.

import type { PlayerCardData } from "@/lib/cards/build";
import { easternDateOf } from "@/lib/packs/week";
import { atlasFor, walkedBy, type Atlas, type AtlasAward, type AtlasLandmark, type AtlasRun } from "./atlas";
import type { CampState } from "./camp";
import type { CampaignState } from "./campaigns";
import type { Rivalry } from "./company";
import { EXPEDITION_TIERS, type CardCopy, type ExpeditionTierKey } from "./config";
import { goalKindFor, leagueBoardFor, targetFor, weeksToWatch, type LeagueBoard, type LeagueProgressRow } from "./league";
import { roadOf, type ConvoyView, type ExpeditionRun, type Grave, type LostHold } from "./queries";
import { forksFor } from "./routes";
import type { Accolade, StandingRow } from "./standings";
import { buildRunViews, campaignRoadTitles, landmarkRefs, type RunView } from "./views";
import type { WeatherKey } from "./weather";

export type Persona = "new" | "mid" | "veteran";

export const PERSONAS: Persona[] = ["new", "mid", "veteran"];

export const PERSONA_LABELS: Record<Persona, string> = {
  new: "Brand new",
  mid: "Mid-game, a fork open",
  veteran: "Veteran",
};

export function isPersona(value: unknown): value is Persona {
  return typeof value === "string" && (PERSONAS as string[]).includes(value);
}

/** Everything ExpeditionBoard takes, as the page would hand it over. */
export interface BoardFixture {
  copies: CardCopy[];
  runs: ExpeditionRun[];
  deployedIds: Set<number>;
  today: string;
  holds: LostHold[];
  graves: Grave[];
  fragments: number;
  patron: boolean;
  policyUsed: boolean;
  insuredThisWeek: number;
  playingToday: string[];
  /** What each squad in the field knows of its road (buildRunViews). */
  views: Record<number, RunView>;
  convoys: Record<number, ConvoyView>;
  rivalries: Rivalry[];
  weather: WeatherKey | null;
  standings: StandingRow[];
  accolades: Accolade[];
  viewerId: string | null;
  campaign: CampaignState | null;
  /** The open campaign's next road, by title (campaignRoadTitles). */
  campaignRoad: string[];
  season: string;
  legendMark: boolean;
  base: string;
  camp: CampState | null;
  forgedThisWeek: number | null;
  balance: number;
  league: LeagueBoard | null;
  /** The season's atlas (atlasFor), as the page builds it. */
  atlas: Atlas | null;
}

const HOUR = 60 * 60 * 1000;
const SEASON = "S5";
const VIEWER = "viewer";
/** The viewer's name where other collectors see it (the standings, the
 *  league goal's leaders). */
const VIEWER_NAME = "Marlow";

const TIER_LABEL: Record<string, string> = {
  bronze: "Bronze", silver: "Silver", gold: "Gold", platinum: "Platinum", emerald: "Emerald",
  diamond: "Diamond", master: "Master", challenger: "Challenger",
};

interface CopySpec {
  id: number;
  name: string;
  role: string;
  tier: string;
  archetype: string;
  team?: string;
  champion?: string;
  foil?: string;
  signed?: boolean;
  card?: Partial<PlayerCardData>;
}

function copyOf(spec: CopySpec): CardCopy {
  const card: PlayerCardData = {
    slug: spec.name.toLowerCase().replace(/\s+/g, "-"),
    name: spec.name,
    tag: "NA1",
    teamName: spec.team ?? null,
    teamImageUrl: null,
    role: spec.role,
    overall: 80,
    tier: { key: spec.tier as PlayerCardData["tier"]["key"], label: TIER_LABEL[spec.tier] ?? spec.tier },
    archetype: spec.archetype,
    signature: spec.champion ? { champion: spec.champion, games: 12 } : null,
    artSkin: 0,
    autograph: null,
    motto: null,
    serial: spec.id,
    collectionSize: 48,
    topChampions: [],
    form: [],
    subStats: [],
    highlights: [],
    badges: [],
    standout: false,
    wins: 10,
    losses: 8,
    winratePct: 56,
    level: 30,
    pentas: 0,
    season: SEASON,
    ...spec.card,
  };
  return {
    id: spec.id,
    season: SEASON,
    slug: card.slug,
    playerName: spec.name,
    role: spec.role,
    editionWeek: "2026-09-14",
    overall: 80,
    tier: spec.tier,
    foil: Boolean(spec.foil),
    foilType: spec.foil ?? null,
    signed: Boolean(spec.signed),
    card,
    packOpenId: null,
    acquiredAt: "2026-09-15T00:00:00.000Z",
    printNumber: spec.id,
    mutation: spec.card?.mutation?.key ?? null,
  };
}

function run(over: Partial<ExpeditionRun> & Pick<ExpeditionRun, "id" | "tier" | "squad" | "startedAt" | "resolvesAt">): ExpeditionRun {
  return {
    shine: 12,
    outcome: null,
    claimedAt: null,
    forks: 0,
    choices: [],
    insured: false,
    target: null,
    fee: 0,
    encounters: [],
    rules: 5,
    convoy: null,
    campaign: null,
    road: null,
    ...over,
  };
}

function claimed(
  id: number,
  tier: ExpeditionRun["tier"],
  squad: number[],
  startedAt: Date,
  hours: number,
  outcome: Partial<NonNullable<ExpeditionRun["outcome"]>> & { dollars: number },
): ExpeditionRun {
  const resolves = new Date(startedAt.getTime() + hours * HOUR);
  return run({
    id,
    tier,
    squad,
    // Every fork the route has: the road it walked, for the atlas.
    forks: tier === "lost" ? 0 : (EXPEDITION_TIERS[tier as ExpeditionTierKey]?.forks ?? 0),
    startedAt: startedAt.toISOString(),
    resolvesAt: resolves.toISOString(),
    claimedAt: new Date(resolves.getTime() + HOUR).toISOString(),
    outcome: {
      grade: "solid",
      comp: false,
      mark: null,
      bearer: null,
      lootMultiplier: 1,
      pushes: 0,
      fragments: 0,
      fates: squad.map((card) => ({ id: card, fate: "home" as const, mutation: null, woundedUntil: null })),
      events: [],
      rescued: null,
      cleansed: null,
      surge: [],
      echo: null,
      ...outcome,
    },
  });
}

function standing(discordId: string, username: string, miles: number, loot: number, survivals = 0, rivalsBeaten = 0): StandingRow {
  return { discordId, username, avatarUrl: null, runs: Math.max(1, Math.round(miles / 2)), miles, loot, survivals, rivalsBeaten };
}

const ago = (now: Date, hours: number) => new Date(now.getTime() - hours * HOUR);

/** The first place a run's road draws: where a squad in the field stands
 *  at its first fork, whatever the seed makes it. */
function firstPlace(entry: ExpeditionRun): string {
  return forksFor(entry.tier as ExpeditionTierKey, roadOf(entry))[0]?.key ?? "";
}
const ahead = (now: Date, hours: number) => new Date(now.getTime() + hours * HOUR);

/** What the page reads for the atlas beyond the runs: the league's
 *  landmarks this season, the roads already paid, and whose trophy wall
 *  has its plaque (fetchLandmarks, fetchAtlasAwards, fetchCrests). */
interface AtlasReads {
  landmarks: AtlasLandmark[];
  awards: AtlasAward[];
  crests: string[];
}

/** A persona before its views: everything the page reads from the
 *  database, and nothing derived from the road. */
type PersonaFixture = Omit<BoardFixture, "views" | "campaignRoad" | "atlas"> & { atlasReads: AtlasReads };

function landmark(place: string, discordId: string, username: string, runId: number, reachedAt: Date): AtlasLandmark {
  return { season: SEASON, place, discordId, username, runId, reachedAt: reachedAt.toISOString() };
}

/**
 * The claimed runs as fetchAtlasRuns reads them, each stamped with the
 * places its seed drew — what the claim stores in outcome.atlas since the
 * atlas opened — so every one counts toward its road.
 */
function atlasRunsOf(runs: ExpeditionRun[]): AtlasRun[] {
  return runs
    .filter((entry) => entry.claimedAt !== null && entry.tier !== "lost")
    .map((entry) => {
      const unstamped: AtlasRun = {
        id: entry.id,
        tier: entry.tier,
        startedAt: entry.startedAt,
        resolvesAt: entry.resolvesAt,
        claimedAt: entry.claimedAt,
        forks: entry.forks,
        rules: entry.rules,
        convoy: entry.convoy,
        road: entry.road,
        stamp: null,
      };
      const { places, encounters, ghosts } = walkedBy(unstamped);
      return { ...unstamped, stamp: { places, encounters, ghosts } };
    });
}

function base(now: Date): Omit<PersonaFixture, "copies" | "runs" | "deployedIds"> {
  return {
    today: easternDateOf(now),
    holds: [],
    graves: [],
    fragments: 0,
    patron: false,
    policyUsed: false,
    insuredThisWeek: 0,
    playingToday: [],
    convoys: {},
    rivalries: [],
    weather: "clear",
    standings: [],
    accolades: [],
    viewerId: VIEWER,
    campaign: null,
    season: SEASON,
    legendMark: false,
    base: "/cards",
    camp: null,
    forgedThisWeek: null,
    balance: 0,
    league: null,
    atlasReads: { landmarks: [], awards: [], crests: [] },
  };
}

/** One collector's week toward the league goal: miles AND pushes, so the
 *  board reads right whichever kind of goal the week turns out to be. */
type Walked = [discordId: string, username: string, miles: number, pushes: number];

/**
 * The league goal as fetchLeagueBoard would build it, from progress rows
 * for this week (and, when given, last week) and the goal that fell. The
 * week's first fixture names it, so it reads like the live one.
 */
function leagueFor(
  now: Date,
  thisWeek: Walked[],
  lastWeek: { walked: Walked[]; fell: { top: string; weekday: number; hourUtc: number } | null } | null = null,
): LeagueBoard | null {
  const [thisMonday, lastMonday] = weeksToWatch(now);
  const rows = (weekStart: string, walked: Walked[]): LeagueProgressRow[] =>
    walked.map(([discordId, username, miles, pushes]) => ({ season: SEASON, weekStart, discordId, username, miles, pushes }));
  const fixtures = [
    { team_a: "Solari Sun", team_b: "Lunar Tide", scheduled_at: `${thisMonday}T23:00:00.000Z`, season: SEASON },
    { team_a: "Lunar Tide", team_b: "Solari Sun", scheduled_at: `${lastMonday}T23:00:00.000Z`, season: SEASON },
  ];
  const kind = goalKindFor(SEASON, lastMonday);
  const fell = lastWeek?.fell ?? null;
  return leagueBoardFor({
    season: SEASON,
    now,
    fixtures,
    progress: [...rows(thisMonday, thisWeek), ...rows(lastMonday, lastWeek?.walked ?? [])],
    goals: fell
      ? [
          {
            season: SEASON,
            weekStart: lastMonday,
            kind,
            target: targetFor(kind),
            fellAt: new Date(Date.parse(`${lastMonday}T00:00:00.000Z`) + (fell.weekday * 24 + fell.hourUtc) * HOUR).toISOString(),
            topId: fell.top,
            rewards: (lastWeek?.walked ?? []).map(([discordId]) => ({ discordId, fragments: 1, top: discordId === fell.top })),
          },
        ]
      : [],
    viewerId: VIEWER,
  });
}

/** A first visit: a handful of cards from the first packs, nothing sent. */
function newcomer(now: Date): PersonaFixture {
  const copies = [
    copyOf({ id: 101, name: "Kai", role: "Jungle", tier: "gold", archetype: "Jungle Diff", champion: "Kayn" }),
    copyOf({ id: 102, name: "Mira", role: "Mid", tier: "platinum", archetype: "Burst Mage", champion: "Syndra", foil: "prisma" }),
    copyOf({ id: 103, name: "Tobi", role: "Top", tier: "silver", archetype: "The Juggernaut", champion: "Darius" }),
    copyOf({ id: 104, name: "Rhea", role: "Support", tier: "bronze", archetype: "Poke Support", champion: "Karma" }),
    copyOf({ id: 105, name: "Otto", role: "Bot", tier: "gold", archetype: "Farm Demon", champion: "Jinx" }),
    copyOf({ id: 106, name: "Lune", role: "Mid", tier: "silver", archetype: "Playmaker", champion: "Ahri" }),
    copyOf({ id: 107, name: "Bram", role: "Top", tier: "bronze", archetype: "Jack of All Trades" }),
  ];
  // Nothing walked yet, but the league has been out: the atlas opens on
  // what bringing a squad home will fill in.
  return {
    ...base(now),
    copies,
    runs: [],
    deployedIds: new Set(),
    weather: "clear",
    atlasReads: {
      landmarks: [landmark("waterworks", "ana", "Ana", 9001, ago(now, 120)), landmark("shaft", "ana", "Ana", 9002, ago(now, 320))],
      awards: [],
      crests: ["ana"],
    },
  };
}

/** Two runs out — a Deep Raid standing at its first fork, a Scouting Run
 *  still walking — a couple home already, and a match tonight. Nobody on
 *  the raid has walked far enough to know its second checkpoint: it is a
 *  `?`, and the fragment the collector holds can show it. */
function midGame(now: Date): PersonaFixture {
  const copies = [
    copyOf({ id: 201, name: "Kai", role: "Jungle", tier: "diamond", archetype: "Jungle Diff", champion: "Kayn", foil: "prisma", team: "Solari Sun" }),
    copyOf({ id: 202, name: "Mira", role: "Mid", tier: "platinum", archetype: "Burst Mage", champion: "Syndra", team: "Solari Sun" }),
    copyOf({ id: 203, name: "Tobi", role: "Top", tier: "gold", archetype: "The Juggernaut", champion: "Darius", card: { trail: { miles: 9, runs: 5, deepest: "raid" } } }),
    copyOf({ id: 204, name: "Rhea", role: "Support", tier: "gold", archetype: "Poke Support", champion: "Karma" }),
    copyOf({ id: 205, name: "Otto", role: "Bot", tier: "emerald", archetype: "Gold Hoarder", champion: "Jinx", foil: "aurora" }),
    copyOf({ id: 206, name: "Lune", role: "Mid", tier: "silver", archetype: "Playmaker", champion: "Ahri" }),
    copyOf({ id: 207, name: "Bram", role: "Top", tier: "bronze", archetype: "Jack of All Trades" }),
    copyOf({ id: 208, name: "Sable", role: "Jungle", tier: "platinum", archetype: "Camp Thief", champion: "Kha'Zix", team: "Lunar Tide" }),
    copyOf({ id: 209, name: "Wren", role: "Support", tier: "silver", archetype: "The Warden", champion: "Thresh" }),
    copyOf({ id: 210, name: "Ivo", role: "Bot", tier: "gold", archetype: "Executioner", champion: "Caitlyn", foil: "prisma" }),
    copyOf({ id: 211, name: "Pax", role: "Top", tier: "master", archetype: "Unkillable", champion: "Garen", card: { mutation: { key: "hardened", date: "2026-09-12", run: 180 } } }),
    copyOf({ id: 212, name: "Nell", role: "Mid", tier: "gold", archetype: "Highlight Reel", champion: "Lux" }),
  ];
  // Stamped with the edge rulebook (ARCHETYPE_RULES), as every launch is
  // once 20261101000001 is applied: Pax's Unkillable speaks at the fork.
  const raid = run({
    id: 301,
    tier: "raid",
    squad: [211, 205, 208],
    shine: 20,
    forks: 2,
    rules: 6,
    startedAt: ago(now, 9).toISOString(),
    resolvesAt: ahead(now, 15).toISOString(),
  });
  const scout = run({
    id: 302,
    tier: "scout",
    squad: [203, 204, 207],
    shine: 8,
    forks: 1,
    startedAt: ago(now, 1.5).toISOString(),
    resolvesAt: ahead(now, 6.5).toISOString(),
  });
  const runs = [
    raid,
    scout,
    claimed(290, "scout", [201, 202, 206], ago(now, 40), 8, { dollars: 118, grade: "solid", pushes: 1, lootMultiplier: 1.3 }),
    claimed(280, "raid", [201, 205, 211], ago(now, 90), 24, {
      dollars: 402,
      grade: "jackpot",
      pushes: 2,
      lootMultiplier: 1.45,
      fragments: 1,
      mark: "trail",
      bearer: 211,
      fates: [
        { id: 201, fate: "home", mutation: null, woundedUntil: null },
        { id: 205, fate: "home", mutation: null, woundedUntil: null },
        { id: 211, fate: "home", mutation: "hardened", woundedUntil: null },
      ],
    }),
  ];
  return {
    ...base(now),
    copies,
    runs,
    deployedIds: new Set([211, 205, 208, 203, 204, 207]),
    fragments: 1,
    weather: "drought",
    playingToday: ["Solari Sun"],
    standings: [
      standing("ana", "Ana", 22, 3100, 1, 3),
      standing("bo", "Bo", 18, 2650, 0, 2),
      standing(VIEWER, VIEWER_NAME, 9, 520, 0, 1),
      standing("cy", "Cy", 7, 610, 0, 0),
      standing("dee", "Dee", 4, 240, 0, 1),
    ],
    rivalries: [
      { who: "ana", name: "Ana", beaten: 1, beatenBy: 2, last: ago(now, 30).toISOString() },
      { who: "cy", name: "Cy", beaten: 2, beatenBy: 0, last: ago(now, 60).toISOString() },
    ],
    // Early in the week: under half-way, and the viewer has put in a
    // little with the Scouting Run they brought home.
    league: leagueFor(now, [
      ["ana", "Ana", 7, 5],
      ["bo", "Bo", 5, 3],
      [VIEWER, VIEWER_NAME, 3, 2],
      ["cy", "Cy", 2, 1],
    ]),
    // Ana reached the raid's first place before anyone, and her plaque is
    // up: the fork the raid stands at says so on its map.
    atlasReads: {
      landmarks: [landmark(firstPlace(raid), "ana", "Ana", 9001, ago(now, 120)), landmark("shaft", "ana", "Ana", 9002, ago(now, 320))],
      awards: [],
      crests: ["ana"],
    },
  };
}

/** Deep in the season: a Legend Hunt home and unclaimed, the Legendary
 *  route out in a convoy, a card lost on the last hunt, two graves, a
 *  campaign on its second stage, a patron's second policy still unspent.
 *  The Legendary squad's only trail title is Tobi's Trailworn, which sees
 *  one checkpoint ahead: the two after it are `?`s, and the squad dreads
 *  the last of them. */
function veteran(now: Date): PersonaFixture {
  const copies = [
    copyOf({ id: 401, name: "Dov", role: "Support", tier: "challenger", archetype: "The Bodyguard", champion: "Braum", foil: "ice", signed: true, team: "Solari Sun", card: { trail: { miles: 31, runs: 14, deepest: "legendary" } } }),
    copyOf({ id: 402, name: "Kai", role: "Jungle", tier: "diamond", archetype: "Jungle Diff", champion: "Kayn", foil: "prisma", card: { trail: { miles: 17, runs: 8, deepest: "legend" } } }),
    copyOf({ id: 403, name: "Mira", role: "Mid", tier: "master", archetype: "Burst Mage", champion: "Syndra", foil: "refractor", team: "Lunar Tide" }),
    copyOf({ id: 404, name: "Tobi", role: "Top", tier: "emerald", archetype: "The Juggernaut", champion: "Darius", signed: true, card: { trail: { miles: 12, runs: 6, deepest: "legend" } } }),
    copyOf({ id: 405, name: "Rhea", role: "Support", tier: "platinum", archetype: "Poke Support", champion: "Karma", card: { mutation: { key: "haunted", date: "2026-09-18", run: 350 } } }),
    copyOf({ id: 406, name: "Otto", role: "Bot", tier: "diamond", archetype: "Gold Hoarder", champion: "Jinx", foil: "aurora" }),
    copyOf({ id: 407, name: "Lune", role: "Mid", tier: "gold", archetype: "Playmaker", champion: "Ahri" }),
    copyOf({ id: 408, name: "Sable", role: "Jungle", tier: "master", archetype: "Camp Thief", champion: "Kha'Zix", foil: "prisma", team: "Lunar Tide" }),
    copyOf({ id: 409, name: "Wren", role: "Support", tier: "gold", archetype: "The Warden", champion: "Thresh", card: { wounded: { until: ahead(now, 30).toISOString(), run: 360 } } }),
    copyOf({ id: 410, name: "Ivo", role: "Bot", tier: "platinum", archetype: "Executioner", champion: "Caitlyn", foil: "prisma" }),
    copyOf({ id: 411, name: "Pax", role: "Top", tier: "challenger", archetype: "Unkillable", champion: "Garen", foil: "prisma", card: { mutation: { key: "voidtouched", date: "2026-09-10", run: 320 } } }),
    copyOf({ id: 412, name: "Nell", role: "Mid", tier: "emerald", archetype: "Highlight Reel", champion: "Lux", foil: "eclipse", signed: true }),
    copyOf({ id: 413, name: "Quill", role: "Jungle", tier: "platinum", archetype: "Speedrunner", champion: "Lee Sin" }),
    copyOf({ id: 414, name: "Juno", role: "Bot", tier: "master", archetype: "The Hypercarry", champion: "Kai'Sa", signed: true }),
    copyOf({ id: 415, name: "Ash", role: "Top", tier: "diamond", archetype: "The Frontline", champion: "Ornn", card: { slab: { wear: 0, at: "2026-09-01T00:00:00.000Z" } } }),
    copyOf({ id: 416, name: "Big Game", role: "Mid", tier: "gold", archetype: "Clutch Gene", card: { moment: { id: 9, title: "ONE MAN ARMY", headline: "40% of the damage", summonerName: "Big Game", champion: "Yasuo", teamName: null, weekStart: "2026-09-07", playerSlug: "big-game" } } }),
    copyOf({ id: 417, name: "Fen", role: "Support", tier: "gold", archetype: "The Lifeline", champion: "Soraka" }),
    copyOf({ id: 418, name: "Cole", role: "Bot", tier: "silver", archetype: "First Blood Merchant", champion: "Ezreal" }),
    // The relic an earlier campaign's finale printed: it hangs on the wall.
    copyOf({ id: 419, name: "Vesper", role: "Mid", tier: "diamond", archetype: "Ice In The Veins", champion: "Orianna", card: { campaign: { key: "lost_print", date: "2026-09-06", campaign: 9, runs: [420, 425, 432], from: 395 } } }),
  ];
  const legend = run({
    id: 501,
    tier: "legend",
    squad: [402, 403, 401],
    shine: 30,
    forks: 3,
    insured: true,
    startedAt: ago(now, 50).toISOString(),
    resolvesAt: ago(now, 2).toISOString(),
    choices: [
      { index: 0, choice: "push", at: ago(now, 38).toISOString() },
      { index: 1, choice: "scout", at: ago(now, 26).toISOString() },
      { index: 2, choice: "camp", at: ago(now, 13).toISOString() },
    ],
  });
  const legendary = run({
    id: 502,
    tier: "legendary",
    squad: [404, 411, 414],
    shine: 44,
    forks: 4,
    convoy: 77,
    startedAt: ago(now, 20).toISOString(),
    resolvesAt: ahead(now, 52).toISOString(),
    choices: [{ index: 0, choice: "push", at: ago(now, 4).toISOString() }],
  });
  const runs = [
    legend,
    legendary,
    claimed(480, "raid", [401, 406, 408], ago(now, 120), 24, { dollars: 610, grade: "jackpot", pushes: 2, lootMultiplier: 1.6, fragments: 1, surge: ["Solari Sun"] }),
    claimed(470, "legend", [401, 410, 418], ago(now, 200), 48, {
      dollars: 505,
      pushes: 3,
      lootMultiplier: 1.7,
      mark: "legend",
      bearer: 401,
      fates: [
        { id: 401, fate: "home", mutation: null, woundedUntil: null },
        { id: 410, fate: "wounded", mutation: null, woundedUntil: ago(now, 100).toISOString() },
        { id: 418, fate: "lost", mutation: null, woundedUntil: null },
      ],
    }),
    claimed(460, "scout", [405, 407, 417], ago(now, 260), 8, { dollars: 96, grade: "poor" }),
    // Earlier in the season: the Scouting Runs that walked the rest of
    // its road (the fair, the orchard wall, the ferry — 460 walked the
    // riverbed and finished it), and the Legend Hunt that reached the
    // empty village before anyone.
    claimed(443, "scout", [412, 413, 415], ago(now, 290), 8, { dollars: 104 }),
    claimed(441, "legend", [401, 408, 406], ago(now, 340), 48, { dollars: 470, pushes: 2, lootMultiplier: 1.4 }),
    claimed(444, "scout", [405, 416, 417], ago(now, 310), 8, { dollars: 88, grade: "poor" }),
    claimed(446, "scout", [407, 410, 413], ago(now, 330), 8, { dollars: 112 }),
  ];
  const holds: LostHold[] = [{ holdId: 471, cardId: 418, expiresAt: ahead(now, 4 * 24 + 6).toISOString(), lostOn: 470, season: SEASON }];
  const graves: Grave[] = [
    { id: 1, inventoryId: 390, slug: "hal", playerName: "Hal", tier: "diamond", foil: true, foilType: "ice", signed: false, card: copyOf({ id: 390, name: "Hal", role: "Mid", tier: "diamond", archetype: "Glass Cannon", card: { trail: { miles: 19, runs: 9, deepest: "legendary" } } }).card, runId: 440, cause: "route", diedAt: ago(now, 300).toISOString() },
    { id: 2, inventoryId: 380, slug: "ivy", playerName: "Ivy", tier: "gold", foil: false, foilType: null, signed: false, card: copyOf({ id: 380, name: "Ivy", role: "Jungle", tier: "gold", archetype: "Duelist" }).card, runId: 430, cause: "unrescued", diedAt: ago(now, 500).toISOString() },
  ];
  const campaign: CampaignState = {
    id: 12,
    key: "broken_map",
    stage: 1,
    runs: [460],
    road: ["waterworks", "pits"],
    log: [{ tier: "scout", grade: "poor", pushes: 0, survivors: 3, places: [], claimedAt: ago(now, 250).toISOString() }],
    startedAt: ago(now, 270).toISOString(),
    finishedAt: null,
    abandoned: false,
    relic: null,
  };
  return {
    ...base(now),
    copies,
    runs,
    deployedIds: new Set([402, 403, 404, 401, 411, 414, 418]),
    holds,
    graves,
    fragments: 3,
    patron: true,
    policyUsed: true,
    insuredThisWeek: 1,
    legendMark: true,
    weather: "watch",
    playingToday: ["Solari Sun", "Lunar Tide"],
    convoys: { 502: { code: "KT7Q2M", host: true, partner: { discordId: "rio", username: "Rio", runId: 503, choices: [{ index: 0, choice: "push", at: ago(now, 5).toISOString() }] } } },
    campaign,
    standings: [
      standing("ana", "Ana", 41, 6100, 2, 5),
      standing(VIEWER, VIEWER_NAME, 38, 5420, 1, 6),
      standing("bo", "Bo", 30, 4800, 1, 2),
      standing("cy", "Cy", 26, 3900, 0, 4),
      standing("dee", "Dee", 19, 2100, 0, 1),
      standing("eli", "Eli", 12, 1500, 0, 0),
      standing("fay", "Fay", 9, 800, 0, 1),
      standing("gus", "Gus", 6, 450, 0, 0),
      standing("hal", "Hana", 3, 200, 0, 0),
    ],
    accolades: [],
    rivalries: [
      { who: "ana", name: "Ana", beaten: 3, beatenBy: 3, last: ago(now, 30).toISOString() },
      { who: "bo", name: "Bo", beaten: 4, beatenBy: 1, last: ago(now, 50).toISOString() },
      { who: "cy", name: "Cy", beaten: 0, beatenBy: 2, last: ago(now, 80).toISOString() },
    ],
    // The atlas: the Scouting Run's road walked end to end and paid when
    // 460 came home; half the Legend Hunt's seen, the empty village named
    // after the viewer, the glowing shaft and the drowned chapel after
    // Ana (her plaque is up), the flooded works after Bo.
    atlasReads: {
      landmarks: [
        landmark("shaft", "ana", "Ana", 9002, ago(now, 320)),
        landmark("village", VIEWER, VIEWER_NAME, 441, ago(now, 291)),
        landmark("waterworks", "bo", "Bo", 9003, ago(now, 250)),
        landmark("chapel", "ana", "Ana", 9004, ago(now, 180)),
      ],
      awards: [{ tier: "scout", fragments: 1, comp: false, awardedAt: ago(now, 251).toISOString() }],
      crests: ["ana"],
    },
    // The base camp: the second scouting slot, a tent, a forge holding one
    // policy, a trophy wall. $3,200 in so far; the bigger tent is next.
    camp: { slots: 1, tent: 1, forge: 1, wall: 1, forgedPolicies: 1, spent: 3200 },
    forgedThisWeek: 0,
    balance: 2480,
    // Mid-week, three-quarters there with the viewer second; last week's
    // fell on Thursday with the viewer out in front — this week's Vanguard.
    league: leagueFor(
      now,
      [
        ["ana", "Ana", 9, 6],
        [VIEWER, VIEWER_NAME, 8, 5],
        ["bo", "Bo", 6, 4],
        ["cy", "Cy", 4, 2],
        ["dee", "Dee", 3, 1],
        ["eli", "Eli", 1, 0],
      ],
      {
        walked: [
          [VIEWER, VIEWER_NAME, 14, 9],
          ["ana", "Ana", 12, 8],
          ["bo", "Bo", 9, 5],
          ["cy", "Cy", 7, 4],
        ],
        fell: { top: VIEWER, weekday: 3, hourUtc: 23 },
      },
    ),
  };
}

/** One persona's board, anchored to `now`, with its views derived as the
 *  live page derives them. No reveal is paid in any fixture, so a road
 *  with a `?` ahead offers the button. */
export function boardFixture(persona: Persona, now: Date = new Date()): BoardFixture {
  const { atlasReads, ...fixture } = persona === "mid" ? midGame(now) : persona === "veteran" ? veteran(now) : newcomer(now);
  const crests = new Set(atlasReads.crests);
  return {
    ...fixture,
    views: buildRunViews({
      runs: fixture.runs,
      copies: fixture.copies,
      now,
      reveals: { mine: new Set(), partner: new Set() },
      convoys: fixture.convoys,
      camp: fixture.camp ? { tent: fixture.camp.tent } : null,
      fragments: fixture.fragments,
      landmarks: landmarkRefs(atlasReads.landmarks, fixture.viewerId, crests),
    }),
    campaignRoad: campaignRoadTitles(fixture.campaign),
    atlas: atlasFor(atlasRunsOf(fixture.runs), atlasReads.landmarks, { awards: atlasReads.awards, viewer: fixture.viewerId, crests }),
  };
}
