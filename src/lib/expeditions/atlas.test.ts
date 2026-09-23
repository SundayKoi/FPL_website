import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import {
  ENCOUNTER_WORDS,
  ROAD_REWARDS,
  ROAD_SIZES,
  atlasFor,
  atlasStamp,
  firstNamedLine,
  placeTier,
  placeTitle,
  readAtlasStamp,
  rewardWords,
  roadComplete,
  routeName,
  walkedBy,
  type AtlasLandmark,
  type AtlasRun,
  type AtlasStamp,
} from "./atlas";
import type { RoadCompany } from "./company";
import type { ExpeditionTierKey } from "./config";
import { encountersFor } from "./journal";
import { roadOf } from "./queries";
import { ROADS, forksFor } from "./routes";

/** The newest migration that (re)declares `fn`, and its body. */
function newestBody(fn: string): string {
  const dir = join(process.cwd(), "supabase/migrations");
  const marker = `create or replace function public.${fn}(`;
  const latest = readdirSync(dir)
    .filter((name) => name.endsWith(".sql"))
    .sort()
    .reverse()
    .find((name) => readFileSync(join(dir, name), "utf8").includes(marker));
  expect(latest, `no migration declares ${fn}`).toBeDefined();
  const sql = readFileSync(join(dir, latest!), "utf8");
  const from = sql.indexOf(marker);
  const open = sql.indexOf("$$", from);
  const close = sql.indexOf("$$", open + 2);
  return sql.slice(open + 2, close);
}

const TIERS = Object.keys(ROAD_SIZES) as ExpeditionTierKey[];

describe("the atlas's tables and the database's", () => {
  it("holds ROAD_SIZES equal to expedition_road_size", () => {
    const body = newestBody("expedition_road_size");
    const sizes = Object.fromEntries([...body.matchAll(/when\s+'(\w+)'\s+then\s+(\d+)/g)].map((match) => [match[1], Number(match[2])]));
    expect(sizes).toEqual({ ...ROAD_SIZES });
  });

  it("holds ROAD_REWARDS equal to expedition_road_reward", () => {
    const body = newestBody("expedition_road_reward");
    const rewards = Object.fromEntries(
      [...body.matchAll(/\('(\w+)',\s*(\d+),\s*(true|false)\)/g)].map((match) => [match[1], { fragments: Number(match[2]), comp: match[3] === "true" }]),
    );
    expect(rewards).toEqual({ ...ROAD_REWARDS });
  });

  it("pays something for every road there is to walk, and nothing for a rite", () => {
    for (const tier of TIERS) {
      if (ROAD_SIZES[tier] === 0) expect(ROAD_REWARDS[tier]).toEqual({ fragments: 0, comp: false });
      else expect(ROAD_REWARDS[tier].fragments).toBeGreaterThan(0);
    }
  });

  it("keys every place once across every road, as the landmarks' primary key needs", () => {
    const keys = TIERS.flatMap((tier) => ROADS[tier].flat().map((place) => place.key));
    expect(new Set(keys).size).toBe(keys.length);
    for (const tier of TIERS) {
      for (const place of ROADS[tier].flat()) {
        expect(placeTier(place.key)).toBe(tier);
        expect(placeTitle(place.key)).toBe(place.title);
      }
    }
    expect(placeTitle("nowhere")).toBeNull();
  });
});

describe("atlasStamp", () => {
  const company: RoadCompany = {
    rivals: [],
    crossings: [],
    ghosts: [{ leg: 2, graveId: 77, cardName: "Kai", who: "55", name: "Bo", team: null, stood: false }],
  };

  it("records the road walked, the encounters in leg order and the ghosts by name", () => {
    const forks = forksFor("legend", { runId: 12, rules: 6 });
    const stamp = atlasStamp(
      { tier: "legend" },
      forks,
      [
        { leg: 2, key: "ghost" },
        { leg: 0, key: "merchant" },
        { leg: 1, key: "rival", alone: true },
        { leg: 3, key: "rival" },
      ],
      company,
    );
    expect(stamp).toEqual({
      places: forks.map((place) => place.key),
      // A rival with nobody on the road was the cache under the cairn.
      encounters: ["merchant", "cache", "ghost", "rival"],
      ghosts: [{ grave: 77, name: "Kai", owner: "Bo" }],
    });
  });

  it("names no ghost the company does not, and stamps nothing for a hold", () => {
    expect(atlasStamp({ tier: "legend" }, [], [{ leg: 2, key: "ghost" }], null).ghosts).toEqual([]);
    expect(atlasStamp({ tier: "lost" }, [{ key: "shaft" }], [{ leg: 0, key: "storm" }], company)).toEqual({ places: [], encounters: [], ghosts: [] });
  });
});

describe("readAtlasStamp", () => {
  it("reads a stamp and drops what is not one", () => {
    expect(readAtlasStamp({ places: ["shaft", 3, ""], encounters: ["storm", "dragon"], ghosts: [{ grave: "7", name: "Kai", owner: "Bo" }, { grave: 1 }] })).toEqual({
      places: ["shaft"],
      encounters: ["storm"],
      ghosts: [{ grave: 7, name: "Kai", owner: "Bo" }],
    });
    expect(readAtlasStamp({ places: [], backfilled: true })).toEqual({ places: [], encounters: [], ghosts: [], backfilled: true });
    for (const junk of [null, undefined, "shaft", ["shaft"], { encounters: [] }]) expect(readAtlasStamp(junk)).toBeNull();
  });
});

// === the codex ================================================================

const DAY = 86_400_000;
const t0 = Date.parse("2026-09-01T12:00:00.000Z");
const iso = (days: number) => new Date(t0 + days * DAY).toISOString();

let nextId = 100;
function run(tier: ExpeditionTierKey | "lost", stamp: Partial<AtlasStamp> | null, over: Partial<AtlasRun> = {}): AtlasRun {
  const id = over.id ?? nextId++;
  const day = over.claimedAt ? 0 : id - 100;
  return {
    id,
    tier,
    startedAt: iso(day - 1),
    resolvesAt: iso(day),
    claimedAt: iso(day),
    forks: 3,
    rules: 6,
    convoy: null,
    road: null,
    stamp: stamp ? { places: [], encounters: [], ghosts: [], ...stamp } : null,
    ...over,
  };
}

const LEGEND = ROADS.legend.flat().map((place) => place.key);
const titleOf = (key: string) => ROADS.legend.flat().find((place) => place.key === key)!.title;

function landmark(place: string, discordId: string, username: string, runId: number, days: number): AtlasLandmark {
  return { season: "S5", place, discordId, username, runId, reachedAt: iso(days) };
}

describe("atlasFor", () => {
  it("counts the places seen on each road and titles only those", () => {
    const runs = [
      run("legend", { places: LEGEND.slice(0, 3), encounters: ["storm", "merchant"] }),
      run("legend", { places: [LEGEND[0], LEGEND[3], LEGEND[4]], encounters: ["storm"], ghosts: [{ grave: 9, name: "Kai", owner: "Bo" }] }),
    ];
    const atlas = atlasFor(runs);
    const legend = atlas.roads.find((road) => road.tier === "legend")!;
    expect(legend).toMatchObject({ label: "Legend Hunt", name: "the Legend Hunt", pays: "2 map fragments", size: 9, seen: 5, counted: 5, runs: 2, reward: { fragments: 2, comp: false }, awarded: null });
    expect(legend.places.map((place) => [place.key, place.title, place.times])).toEqual([
      [LEGEND[0], titleOf(LEGEND[0]), 2],
      [LEGEND[1], titleOf(LEGEND[1]), 1],
      [LEGEND[2], titleOf(LEGEND[2]), 1],
      [LEGEND[3], titleOf(LEGEND[3]), 1],
      [LEGEND[4], titleOf(LEGEND[4]), 1],
    ]);
    expect(legend.places[0].firstAt).toBe(runs[0].claimedAt);
    expect(legend.meetings).toEqual([
      { key: "merchant", words: ENCOUNTER_WORDS.merchant, times: 1 },
      { key: "storm", words: ENCOUNTER_WORDS.storm, times: 2 },
    ]);
    expect(legend.ghosts).toEqual([{ name: "Kai", owner: "Bo", at: runs[1].claimedAt }]);
    expect(atlas.runs).toBe(2);
  });

  it("never names a place the collector has not reached", () => {
    const seen = LEGEND.slice(0, 2);
    const atlas = atlasFor(
      [run("legend", { places: seen })],
      // The league has named the whole road; the reader has seen two places.
      LEGEND.map((key, index) => landmark(key, "77", "Ana", 900 + index, index)),
      { viewer: "42" },
    );
    const text = JSON.stringify(atlas);
    for (const key of LEGEND.slice(2)) {
      expect(text).not.toContain(`"${key}"`);
      expect(text).not.toContain(titleOf(key));
    }
    const legend = atlas.roads.find((road) => road.tier === "legend")!;
    expect(legend.places.map((place) => place.key)).toEqual(seen);
    // The unseen landmarks say who and when — never where.
    expect(legend.unseenLandmarks).toHaveLength(LEGEND.length - 2);
    expect(Object.keys(legend.unseenLandmarks[0]).sort()).toEqual(["at", "by", "crest", "mine"]);
  });

  it("lays the league's landmarks over the places seen: whose, and whether they are the reader's", () => {
    const mine = run("legend", { places: [LEGEND[0], LEGEND[1]] });
    const atlas = atlasFor(
      [mine],
      [landmark(LEGEND[0], "42", "Me", mine.id, 0), landmark(LEGEND[1], "77", "Ana", 555, -1), landmark("reactor", "42", "Me", 556, -2)],
      { viewer: "42", crests: new Set(["77"]) },
    );
    const legend = atlas.roads.find((road) => road.tier === "legend")!;
    expect(legend.places[0].landmark).toEqual({ by: "Me", mine: true, crest: false, at: iso(0) });
    expect(legend.places[1].landmark).toEqual({ by: "Ana", mine: false, crest: true, at: iso(-1) });
    // The reader's own landmarks, first named first, wherever they are.
    expect(atlas.named.map((entry) => [entry.key, entry.tier])).toEqual([
      ["reactor", "raid"],
      [LEGEND[0], "legend"],
    ]);
    // A Deep Raid place the reader named but whose run is not in this read
    // is still theirs by id, and not seen on that road here.
    expect(atlas.roads.find((road) => road.tier === "raid")!.unseenLandmarks).toEqual([{ by: "Me", mine: true, crest: false, at: iso(-2) }]);
  });

  it("re-derives an unstamped run's road, which shows but does not count toward the reward", () => {
    const old = run("legend", null, { rules: 5 });
    const derived = forksFor("legend", roadOf(old)).map((place) => place.key);
    const atlas = atlasFor([old]);
    const legend = atlas.roads.find((road) => road.tier === "legend")!;
    expect(legend.places.map((place) => place.key)).toEqual(derived);
    expect(legend.seen).toBe(derived.length);
    expect(legend.counted).toBe(0);
    // Ghosts need the company the claim read; an old run's are unknown.
    expect(walkedBy(old).ghosts).toEqual([]);
    expect(walkedBy(old).encounters).toEqual(
      encountersFor({ id: old.id, tier: "legend", startedAt: old.startedAt, resolvesAt: old.resolvesAt, forks: 3, rules: 5, convoy: null })
        .map((encounter) => encounter.key)
        .filter((key) => key !== "ghost"),
    );
  });

  it("reads only claimed runs of a route, and says which roads were already paid", () => {
    const atlas = atlasFor(
      [
        run("legend", { places: [LEGEND[0]] }, { claimedAt: null }),
        run("lost", { places: [LEGEND[1]] }),
        run("exorcism", { places: [] }, { forks: 0 }),
        run("raid", { places: ["reactor"] }),
      ],
      [],
      { awards: [{ tier: "raid", fragments: 1, comp: false, awardedAt: iso(3) }] },
    );
    expect(atlas.runs).toBe(2);
    expect(atlas.roads.map((road) => road.tier)).not.toContain("exorcism");
    expect(atlas.roads.find((road) => road.tier === "legend")).toMatchObject({ seen: 0, runs: 0, places: [] });
    expect(atlas.roads.find((road) => road.tier === "raid")!.awarded).toEqual({ fragments: 1, comp: false, at: iso(3) });
  });
});

describe("roadComplete", () => {
  it("is the stamps covering the whole road, whichever runs walked it", () => {
    const partial = [run("legend", { places: LEGEND.slice(0, 3) }), run("legend", { places: LEGEND.slice(3, 6) })];
    expect(roadComplete(atlasFor(partial), "legend")).toBe(false);
    const whole = [...partial, run("legend", { places: LEGEND.slice(6) })];
    expect(roadComplete(atlasFor(whole), "legend")).toBe(true);
    expect(roadComplete(atlasFor(whole), "raid")).toBe(false);
  });

  it("does not count a road walked before the atlas, and never a rite", () => {
    const history = ROADS.scout.flat().map((_, index) => run("scout", null, { rules: 3, forks: 1, id: 400 + index }));
    const atlas = atlasFor(history);
    expect(atlas.roads.find((road) => road.tier === "scout")!.counted).toBe(0);
    expect(roadComplete(atlas, "scout")).toBe(false);
    expect(roadComplete(atlas, "exorcism")).toBe(false);
  });
});

describe("the words", () => {
  it("names the first to a place, a route mid-sentence and a reward", () => {
    expect(firstNamedLine("Ann", ["The drowned chapel"], "legend")).toBe("Ann was first to the drowned chapel on the Legend Hunt.");
    expect(firstNamedLine("Ann", ["The glowing shaft", "The drowned chapel", "The vault door"])).toBe(
      "Ann was first to the glowing shaft, the drowned chapel and the vault door.",
    );
    expect(routeName("gilded")).toBe("the Gilded Road");
    expect(routeName("raid")).toBe("the Deep Raid");
    expect(rewardWords(ROAD_REWARDS.legendary)).toBe("2 map fragments and a free pack");
    expect(rewardWords(ROAD_REWARDS.scout)).toBe("1 map fragment");
    expect(rewardWords(ROAD_REWARDS.exorcism)).toBe("nothing");
  });
});
