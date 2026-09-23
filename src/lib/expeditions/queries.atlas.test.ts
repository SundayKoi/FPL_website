import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSupabaseFrom, supabaseQuery, type SupabaseFilterCall, type SupabaseQueryResult } from "@/test-utils/supabaseQuery";
import { fetchAtlasAwards, fetchAtlasRuns, fetchLandmarks, fetchRuns } from "./queries";

function client(responses: Record<string, SupabaseQueryResult[]>) {
  const log: SupabaseFilterCall[] = [];
  const from = makeSupabaseFrom(responses, log);
  return { supabase: { from } as unknown as SupabaseClient, from, log };
}

const MISSING = { data: null, error: { message: 'relation "public.expedition_landmarks" does not exist' } };

const atlasRow = (over: Record<string, unknown> = {}) => ({
  id: 7,
  tier: "legend",
  started_at: "2026-09-01T00:00:00.000Z",
  resolves_at: "2026-09-03T00:00:00.000Z",
  claimed_at: "2026-09-03T01:00:00.000Z",
  forks: 3,
  rules: 6,
  convoy: null,
  road: null,
  atlas: { places: ["shaft", "chapel", "vault"], encounters: ["storm"], ghosts: [] },
  ...over,
});

describe("fetchAtlasRuns", () => {
  it("reads the collector's claimed runs of one season, and only the stamp from each outcome", async () => {
    const { supabase, log } = client({
      expedition_runs: [{ data: [atlasRow(), atlasRow({ id: 8, atlas: null, road: ["reactor", 3] })], error: null }],
    });
    const runs = await fetchAtlasRuns(supabase, "42", "S5", "legend");
    expect(log).toEqual(
      expect.arrayContaining([
        { table: "expedition_runs", method: "select", args: ["id, tier, started_at, resolves_at, claimed_at, forks, rules, convoy, road, atlas:outcome->atlas"] },
        { table: "expedition_runs", method: "eq", args: ["discord_id", "42"] },
        { table: "expedition_runs", method: "eq", args: ["season", "S5"] },
        { table: "expedition_runs", method: "not", args: ["claimed_at", "is", null] },
        { table: "expedition_runs", method: "neq", args: ["tier", "lost"] },
        { table: "expedition_runs", method: "eq", args: ["tier", "legend"] },
      ]),
    );
    expect(runs).toEqual([
      {
        id: 7,
        tier: "legend",
        startedAt: "2026-09-01T00:00:00.000Z",
        resolvesAt: "2026-09-03T00:00:00.000Z",
        claimedAt: "2026-09-03T01:00:00.000Z",
        forks: 3,
        rules: 6,
        convoy: null,
        road: null,
        stamp: { places: ["shaft", "chapel", "vault"], encounters: ["storm"], ghosts: [] },
      },
      expect.objectContaining({ id: 8, stamp: null, road: null }),
    ]);
  });

  it("reads every page, so a long season still counts", async () => {
    const page = Array.from({ length: 1000 }, (_, index) => atlasRow({ id: index + 1 }));
    const { supabase, log } = client({ expedition_runs: [{ data: page, error: null }, { data: [atlasRow({ id: 1001 })], error: null }] });
    expect(await fetchAtlasRuns(supabase, "42", "S5")).toHaveLength(1001);
    expect(log.filter((call) => call.method === "range").map((call) => call.args)).toEqual([
      [0, 999],
      [1000, 1999],
    ]);
    expect(log.some((call) => call.method === "eq" && call.args[0] === "tier")).toBe(false);
  });

  it("fails soft to null, and asks nothing without a season", async () => {
    const { supabase } = client({ expedition_runs: [{ data: null, error: { message: "boom" } }] });
    expect(await fetchAtlasRuns(supabase, "42", "S5")).toBeNull();
    const idle = client({});
    expect(await fetchAtlasRuns(idle.supabase, "42", "")).toBeNull();
    expect(idle.from).not.toHaveBeenCalled();
  });
});

describe("fetchLandmarks", () => {
  it("reads one season's landmarks and names their namers", async () => {
    const { supabase, log } = client({
      expedition_landmarks: [
        {
          data: [
            { season: "S5", place: "shaft", discord_id: "42", run_id: "7", reached_at: "2026-09-03T01:00:00.000Z" },
            { season: "S5", place: "chapel", discord_id: "77", run_id: 9, reached_at: "2026-09-04T01:00:00.000Z" },
            // The other league's shaft is somebody else's news.
            { season: "A1", place: "shaft", discord_id: "77", run_id: 10, reached_at: "2026-09-04T02:00:00.000Z" },
          ],
          error: null,
        },
      ],
      betting_profiles: [{ data: [{ discord_id: "42", username: "Ann" }], error: null }],
    });
    expect(await fetchLandmarks(supabase, "S5")).toEqual([
      { season: "S5", place: "shaft", discordId: "42", username: "Ann", runId: 7, reachedAt: "2026-09-03T01:00:00.000Z" },
      { season: "S5", place: "chapel", discordId: "77", username: "Another collector", runId: 9, reachedAt: "2026-09-04T01:00:00.000Z" },
    ]);
    expect(log).toContainEqual({ table: "expedition_landmarks", method: "eq", args: ["season", "S5"] });
    expect(log).toContainEqual({ table: "betting_profiles", method: "in", args: ["discord_id", ["42", "77"]] });
  });

  it("fails soft to null when the table is not there", async () => {
    const { supabase } = client({ expedition_landmarks: [MISSING] });
    expect(await fetchLandmarks(supabase, "S5")).toBeNull();
  });
});

describe("fetchAtlasAwards", () => {
  it("reads the collector's paid roads for one season", async () => {
    const { supabase, log } = client({
      expedition_atlas_awards: [
        {
          data: [
            { discord_id: "42", season: "S5", tier: "legend", fragments: 2, comp: false, awarded_at: "2026-09-05T00:00:00.000Z" },
            { discord_id: "77", season: "S5", tier: "raid", fragments: 1, comp: false, awarded_at: "2026-09-05T00:00:00.000Z" },
            { discord_id: "42", season: "A1", tier: "raid", fragments: 1, comp: false, awarded_at: "2026-09-05T00:00:00.000Z" },
          ],
          error: null,
        },
      ],
    });
    expect(await fetchAtlasAwards(supabase, "42", "S5")).toEqual([{ tier: "legend", fragments: 2, comp: false, awardedAt: "2026-09-05T00:00:00.000Z" }]);
    expect(log).toContainEqual({ table: "expedition_atlas_awards", method: "eq", args: ["discord_id", "42"] });
    expect(log).toContainEqual({ table: "expedition_atlas_awards", method: "eq", args: ["season", "S5"] });
  });

  it("fails soft to null", async () => {
    const { supabase } = client({ expedition_atlas_awards: [MISSING] });
    expect(await fetchAtlasAwards(supabase, "42", "S5")).toBeNull();
  });
});

describe("a claimed outcome's atlas and edges", () => {
  const runRow = (outcome: Record<string, unknown>) => ({
    id: 7,
    tier: "legend",
    squad: [1, 2, 3],
    shine: 20,
    started_at: "2026-09-01T00:00:00.000Z",
    resolves_at: "2026-09-03T00:00:00.000Z",
    outcome: { grade: "solid", dollars: 400, ...outcome },
    claimed_at: "2026-09-03T01:00:00.000Z",
    forks: 3,
    choices: [],
    insured: false,
    target: null,
    fee: 0,
  });

  it("maps them when the outcome carries them, and leaves them off when it does not", async () => {
    const from = vi.fn(() =>
      supabaseQuery({
        data: [
          runRow({ atlas: { places: ["shaft"], encounters: ["storm"], ghosts: [] }, abilities: [{ copyId: 1, title: "Gold Hoarder", kind: "merchant" }] }),
          runRow({}),
        ],
        error: null,
      }),
    );
    const [stamped, plain] = await fetchRuns({ from } as unknown as SupabaseClient, "42", "S5");
    expect(stamped.outcome?.atlas).toEqual({ places: ["shaft"], encounters: ["storm"], ghosts: [] });
    expect(stamped.outcome?.abilities).toEqual([{ copyId: 1, title: "Gold Hoarder", kind: "merchant" }]);
    expect(plain.outcome).not.toHaveProperty("atlas");
    expect(plain.outcome).not.toHaveProperty("abilities");
  });
});
