import { describe, expect, it } from "vitest";
import { describePlan, parseArgs, planAtlasBackfill, type BackfillRun } from "./backfill-expedition-atlas";
import { roadOf } from "../src/lib/expeditions/queries";
import { ROADS, forksFor } from "../src/lib/expeditions/routes";

const RAID = ROADS.raid.flat().map((place) => place.key);

let nextId = 1;
function run(over: Partial<BackfillRun> & Pick<BackfillRun, "discordId" | "claimedAt">): BackfillRun {
  return {
    id: nextId++,
    season: "S5",
    tier: "raid",
    startedAt: "2026-09-01T00:00:00.000Z",
    resolvesAt: "2026-09-02T00:00:00.000Z",
    forks: 2,
    rules: 3,
    convoy: null,
    road: null,
    stamp: null,
    outcome: { grade: "solid", dollars: 300 },
    ...over,
  };
}

describe("planAtlasBackfill", () => {
  it("stamps only the runs without a stamp, from the road their journal showed", () => {
    const old = run({ discordId: "ann", claimedAt: "2026-09-02T01:00:00.000Z" });
    const stamped = run({ discordId: "ann", claimedAt: "2026-09-03T01:00:00.000Z", stamp: { places: ["mast", "pits"], encounters: [], ghosts: [] } });
    const empty = run({ discordId: "ann", claimedAt: "2026-09-04T01:00:00.000Z", outcome: null });
    const plan = planAtlasBackfill({ runs: [stamped, old, empty], landmarks: [], awards: [] });

    expect(plan.stamps).toEqual([
      {
        runId: old.id,
        discordId: "ann",
        season: "S5",
        tier: "raid",
        stamp: { places: forksFor("raid", roadOf(old)).map((place) => place.key), encounters: expect.any(Array), ghosts: [], backfilled: true },
      },
    ]);
    // A run with nothing to stamp into is reported, not invented.
    expect(plan.skipped).toEqual([empty.id]);
  });

  it("names landmarks oldest claim first, keeping every place already named, one league at a time", () => {
    const later = run({ discordId: "bo", claimedAt: "2026-09-05T01:00:00.000Z", stamp: { places: ["reactor", "ridge"], encounters: [], ghosts: [] } });
    const earlier = run({ discordId: "ann", claimedAt: "2026-09-02T01:00:00.000Z", stamp: { places: ["reactor", "barricade"], encounters: [], ghosts: [] } });
    const academy = run({ discordId: "cy", season: "A1", claimedAt: "2026-09-06T01:00:00.000Z", stamp: { places: ["reactor"], encounters: [], ghosts: [] } });
    const plan = planAtlasBackfill({
      runs: [later, academy, earlier],
      // A live claim since the atlas shipped already named the barricade.
      landmarks: [{ season: "S5", place: "barricade" }],
      awards: [],
    });
    expect(plan.names.map((step) => [step.discordId, step.season, step.places])).toEqual([
      ["ann", "S5", ["reactor"]],
      ["bo", "S5", ["ridge"]],
      ["cy", "A1", ["reactor"]],
    ]);
  });

  it("pays a road the stamps, old and new, now cover — once, and only in its own season", () => {
    const ann = [
      run({ discordId: "ann", claimedAt: "2026-09-02T01:00:00.000Z", stamp: { places: RAID.slice(0, 2), encounters: [], ghosts: [] } }),
      run({ discordId: "ann", claimedAt: "2026-09-03T01:00:00.000Z", stamp: { places: RAID.slice(2, 4), encounters: [], ghosts: [] } }),
      run({ discordId: "ann", claimedAt: "2026-09-04T01:00:00.000Z", stamp: { places: RAID.slice(4), encounters: [], ghosts: [] } }),
    ];
    // Bo walked the same six places, split across two leagues.
    const bo = [
      run({ discordId: "bo", claimedAt: "2026-09-02T02:00:00.000Z", stamp: { places: RAID.slice(0, 4), encounters: [], ghosts: [] } }),
      run({ discordId: "bo", season: "A1", claimedAt: "2026-09-03T02:00:00.000Z", stamp: { places: RAID.slice(4), encounters: [], ghosts: [] } }),
    ];
    // Cy walked all six too, and was paid when it happened.
    const cy = [run({ discordId: "cy", claimedAt: "2026-09-02T03:00:00.000Z", stamp: { places: RAID, encounters: [], ghosts: [] } })];
    const plan = planAtlasBackfill({ runs: [...ann, ...bo, ...cy], landmarks: [], awards: [{ discordId: "cy", season: "S5", tier: "raid" }] });
    expect(plan.awards).toEqual([{ discordId: "ann", season: "S5", tier: "raid", reward: { fragments: 1, comp: false } }]);
  });

  it("reads as a plan the owner can check before anything is written", () => {
    const plan = planAtlasBackfill({
      runs: [run({ discordId: "ann", claimedAt: "2026-09-02T01:00:00.000Z", stamp: { places: ["reactor"], encounters: [], ghosts: [] } })],
      landmarks: [],
      awards: [],
    });
    const lines = describePlan(plan, new Map([["ann", "Ann"]]));
    expect(lines).toContain("Stamps: 0 claimed runs without one.");
    expect(lines).toContain("Landmarks: 1 place to name, oldest claim first.");
    expect(lines.some((line) => line.includes("S5 · Deep Raid · The reactor → Ann"))).toBe(true);
    expect(lines).toContain("Roads walked end to end and not yet paid: 0 (pass --award to pay them).");
  });
});

describe("parseArgs", () => {
  it("reads the dry run, the season and the award switch, and refuses anything else", () => {
    expect(parseArgs([])).toEqual({ dryRun: false, award: false, season: null });
    expect(parseArgs(["--dry-run", "--season", "S5", "--award"])).toEqual({ dryRun: true, award: true, season: "S5" });
    expect(() => parseArgs(["--season"])).toThrow("--season needs a season label");
    expect(() => parseArgs(["--force"])).toThrow('Unknown argument "--force"');
  });
});
