import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ROADS } from "./routes";
import { CAMPAIGNS, CAMPAIGN_ORDER, canBind, nextRoad, nextTier, relicBearer, roadStory, type StageLog } from "./campaigns";

const stage = (over: Partial<StageLog> & { tier: StageLog["tier"] }): StageLog => ({
  grade: "solid", pushes: 0, survivors: 3, places: [], claimedAt: "2026-09-09T00:00:00Z", ...over,
});

describe("campaigns", () => {
  it("holds the SQL's stages and the config's to the same tiers", () => {
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261014000001_expedition_campaigns.sql"), "utf8");
    for (const key of CAMPAIGN_ORDER) {
      const match = sql.match(new RegExp(`when '${key}' then \\(array\\[([^\\]]+)\\]\\)`));
      expect(match, key).not.toBeNull();
      expect(match![1].split(",").map((s) => s.trim().replace(/'/g, ""))).toEqual(CAMPAIGNS[key].stages);
    }
  });

  it("every road it hands down is a real place at that checkpoint", () => {
    const grades = ["poor", "solid", "jackpot"] as const;
    for (const key of CAMPAIGN_ORDER) {
      for (const tier of CAMPAIGNS[key].stages) {
        for (const grade of grades) {
          for (const pushes of [0, 1, 2, 3]) {
            for (const survivors of [0, 1, 2, 3]) {
              const road = nextRoad(key, stage({ tier, grade, pushes, survivors }));
              const next = CAMPAIGNS[key].stages[CAMPAIGNS[key].stages.indexOf(tier) + 1];
              if (!next) {
                expect(road).toBeNull();
                continue;
              }
              expect(road).toHaveLength(ROADS[next].length);
              road!.forEach((place, slot) => expect(ROADS[next][slot].map((fork) => fork.key), `${key} ${next} slot ${slot}`).toContain(place));
            }
          }
        }
      }
    }
  });

  it("a poor scout opens the raid in the flooded works, and a jackpot hunt puts the threshold behind the doors", () => {
    expect(nextRoad("broken_map", stage({ tier: "scout", grade: "poor" }))![0]).toBe("waterworks");
    expect(nextRoad("broken_map", stage({ tier: "scout", grade: "jackpot", pushes: 1 }))).toEqual(["mast", "barricade"]);
    expect(nextRoad("broken_map", stage({ tier: "raid", grade: "jackpot", pushes: 2 }))).toEqual(["chapel", "belltower", "throne"]);
    expect(nextRoad("broken_map", stage({ tier: "raid", grade: "solid", pushes: 2, survivors: 2 }))).toEqual(["shaft", "village", "vault"]);
    expect(nextRoad("lost_print", stage({ tier: "legend", grade: "jackpot", pushes: 2 }))).toEqual(["doors", "choir", "tide", "table"]);
    expect(nextRoad("lost_print", stage({ tier: "legend", grade: "poor", pushes: 0, survivors: 1 }))).toEqual(["stairs", "mirrors", "rift", "keeper"]);
  });

  it("knows the next tier, and when a run may bind", () => {
    const open = { key: "broken_map" as const, stage: 1, runs: [10], finishedAt: null };
    expect(nextTier(open)).toBe("raid");
    expect(canBind(open, "raid")).toBe(true);
    expect(canBind(open, "legend")).toBe(false);
    expect(canBind({ ...open, runs: [10, 11] }, "raid")).toBe(false);
    expect(canBind({ ...open, finishedAt: "2026-09-09T00:00:00Z" }, "raid")).toBe(false);
    expect(canBind(null, "raid")).toBe(false);
    expect(nextTier({ key: "lost_print", stage: 3 })).toBeNull();
  });

  it("tells the story of the road ahead", () => {
    expect(roadStory("broken_map", { stage: 0, road: null, log: [] })).toMatch(/own draw/);
    const poor = { stage: 1, road: ["waterworks", "ridge"], log: [stage({ tier: "scout", grade: "poor" })] };
    expect(roadStory("broken_map", poor)).toBe("A poor scout: the raid opens in the flooded works.");
    const done = { stage: 3, road: null, log: [] };
    expect(roadStory("broken_map", done)).toBeNull();
  });

  it("hands the relic to the survivor with the most miles", () => {
    const copies = [
      { id: 1, card: { trail: { miles: 9 } } },
      { id: 2, card: { trail: { miles: 12 } } },
      { id: 3, card: { trail: { miles: 12 } } },
    ];
    const fates = [
      { id: 1, fate: "home" as const, mutation: null, woundedUntil: null },
      { id: 2, fate: "dead" as const, mutation: null, woundedUntil: null },
      { id: 3, fate: "wounded" as const, mutation: null, woundedUntil: null },
    ];
    expect(relicBearer(fates, copies)).toBe(3);
    expect(relicBearer(fates.map((fate) => ({ ...fate, fate: "lost" as const })), copies)).toBeNull();
    const tied = fates.map((fate) => ({ ...fate, fate: "home" as const }));
    expect(relicBearer(tied, copies)).toBe(2);
  });
});
