import { describe, expect, it } from "vitest";
import type { WeeklyRawStatRow } from "@/lib/stats/weekly";
import { scoreLineup, weeklyScoresBySlug, type StoredSlots } from "./scoring";

/** A raw_stats row with everything the aggregation reads set to a neutral
 *  zero, so a test only has to name the fields it cares about. */
function statRow(over: Partial<WeeklyRawStatRow>): WeeklyRawStatRow {
  return {
    game_date: "2026-08-19T00:00:00Z",
    assists: 0,
    cs: 0,
    cs_at_10: 0,
    cs_per_min: 0,
    damage_per_min: 0,
    damage_share_pct: 0,
    damage_taken_per_min: 0,
    deaths: 0,
    double_kills: 0,
    first_blood_assist: false,
    first_blood_kill: false,
    game_duration_min: 30,
    gold_at_10: 0,
    gold_earned: 0,
    gold_per_min: 0,
    kda_challenges: 0,
    kill_participation_pct: 0,
    kills: 0,
    penta_kills: 0,
    quadra_kills: 0,
    role: "MIDDLE",
    season: "S5",
    season_phase: "Regular",
    solo_kills: 0,
    summoner_name: "Nobody",
    tag: "NA1",
    total_damage_to_champions: 0,
    triple_kills: 0,
    turret_plates_destroyed: 0,
    vision_score: 0,
    vision_score_per_min: 0,
    win: false,
    xp_at_10: 0,
    ...over,
  };
}

function slot(playerName: string, slug: string, overall = 70) {
  return { inventoryId: 1, slug, playerName, overall, editionWeek: "2026-08-17", foil: false };
}

describe("weeklyScoresBySlug", () => {
  const rows = [
    statRow({ summoner_name: "Rutledge", tag: "NA1", win: true, kills: 9, assists: 6, deaths: 1, cs: 300, gold_earned: 14000, total_damage_to_champions: 30000 }),
    statRow({ summoner_name: "Bandit", tag: "EUW", win: false, kills: 1, assists: 2, deaths: 8, cs: 150, gold_earned: 8000, total_damage_to_champions: 9000 }),
  ];

  it("keys scores by card slug", () => {
    const scores = weeklyScoresBySlug(rows);
    expect([...scores.keys()].sort()).toEqual(["bandit-euw", "rutledge-na1"]);
  });

  it("scores every player on the 0-100 power scale", () => {
    for (const score of weeklyScoresBySlug(rows).values()) {
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    }
  });

  it("rates the stronger week higher", () => {
    const scores = weeklyScoresBySlug(rows);
    expect(scores.get("rutledge-na1")!).toBeGreaterThan(scores.get("bandit-euw")!);
  });

  it("merges a player's several games into one entry", () => {
    const scores = weeklyScoresBySlug([...rows, statRow({ summoner_name: "Rutledge", tag: "NA1", win: true, kills: 4 })]);
    expect(scores.size).toBe(2);
  });

  it("returns an empty map for a week with no games", () => {
    expect(weeklyScoresBySlug([]).size).toBe(0);
  });
});

describe("scoreLineup", () => {
  const slots: StoredSlots = {
    Top: slot("Rutledge", "rutledge-na1"),
    Jungle: slot("Bandit", "bandit-euw"),
    Mid: slot("Sable", "sable-na1"),
    Bot: slot("Kite", "kite-na1"),
    Support: slot("Warden", "warden-na1"),
  };

  it("sums each fielded player's weekly power score", () => {
    const scores = new Map([
      ["rutledge-na1", 76.8],
      ["bandit-euw", 60.2],
      ["sable-na1", 55.5],
      ["kite-na1", 44.1],
      ["warden-na1", 31.4],
    ]);
    const result = scoreLineup(slots, scores);
    expect(result.score).toBe(268);
    expect(result.breakdown.Top).toEqual({ slug: "rutledge-na1", playerName: "Rutledge", points: 76.8 });
    expect(result.breakdown.Support).toEqual({ slug: "warden-na1", playerName: "Warden", points: 31.4 });
  });

  it("scores a player who didn't play that week as 0, keeping the slot in the breakdown", () => {
    const result = scoreLineup(slots, new Map([["rutledge-na1", 50]]));
    expect(result.score).toBe(50);
    expect(result.breakdown.Bot).toEqual({ slug: "kite-na1", playerName: "Kite", points: 0 });
  });

  it("rounds the total to one decimal", () => {
    const scores = new Map([
      ["rutledge-na1", 10.1],
      ["bandit-euw", 10.1],
      ["sable-na1", 10.1],
      ["kite-na1", 10.1],
      ["warden-na1", 10.1],
    ]);
    expect(scoreLineup(slots, scores).score).toBe(50.5);
  });

  it("skips roles the stored lineup doesn't have", () => {
    const partial: StoredSlots = { Mid: slot("Sable", "sable-na1") };
    const result = scoreLineup(partial, new Map([["sable-na1", 20]]));
    expect(result.score).toBe(20);
    expect(Object.keys(result.breakdown)).toEqual(["Mid"]);
  });

  it("scores an all-absent lineup as zero", () => {
    expect(scoreLineup(slots, new Map()).score).toBe(0);
  });
});
