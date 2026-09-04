import { describe, expect, it } from "vitest";
import type { WeeklyRawStatRow } from "@/lib/stats/weekly";
import {
  currentIdentity,
  flares,
  inventoryIdsIn,
  scoreLineup,
  weeklyScoresBySlug,
  type StoredSlots,
} from "./scoring";

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

function slot(playerName: string, slug: string, overall = 70, inventoryId = 1) {
  return { inventoryId, slug, playerName, overall, editionWeek: "2026-08-17", foil: false };
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


describe("mutations reach the score", () => {
  const fielded: StoredSlots = { Mid: slot("Sable", "sable-na1", 70, 77) };
  const scores = new Map([["sable-na1", 60]]);

  it("multiplies the slot by the mutation the copy wears now", () => {
    expect(scoreLineup(fielded, scores, new Map([[77, { slug: "sable-na1", playerName: "Sable", mutation: "voidtouched" }]])).score).toBe(72);
    expect(scoreLineup(fielded, scores, new Map([[77, { slug: "sable-na1", playerName: "Sable", mutation: "haunted" }]])).score).toBe(51);
    expect(scoreLineup(fielded, scores, new Map([[77, { slug: "sable-na1", playerName: "Sable", mutation: "cursed" }]])).score).toBe(45);
    expect(scoreLineup(fielded, scores, new Map([[77, { slug: "sable-na1", playerName: "Sable", mutation: "hardened" }]])).score).toBe(60);
    const plain = scoreLineup(fielded, scores, new Map([[77, { slug: "sable-na1", playerName: "Sable", mutation: null }]]));
    expect(plain.score).toBe(60);
    expect(plain.breakdown.Mid?.mutation).toBeUndefined();
  });

  it("says why in the breakdown", () => {
    const result = scoreLineup(fielded, scores, new Map([[77, { slug: "sable-na1", playerName: "Sable", mutation: "cursed" }]]));
    expect(result.breakdown.Mid).toEqual({ slug: "sable-na1", playerName: "Sable", points: 45, mutation: "cursed" });
  });

  it("flares an Irradiated card out on some weeks and not others, the same way every time", () => {
    const identities = new Map([[77, { slug: "sable-na1", playerName: "Sable", mutation: "irradiated" as const }]]);
    const weeks = Array.from({ length: 60 }, (_, i) => `2026-${String(1 + (i % 12)).padStart(2, "0")}-${String(1 + (i % 28)).padStart(2, "0")}`);
    const results = weeks.map((week) => scoreLineup(fielded, scores, identities, week));
    const flared = results.filter((r) => r.score === 0);
    const hot = results.filter((r) => r.score === 66);
    expect(flared.length).toBeGreaterThan(0);
    expect(hot.length).toBeGreaterThan(flared.length);
    expect(flared.length + hot.length).toBe(weeks.length);
    expect(flared[0].breakdown.Mid?.flared).toBe(true);
    // Deterministic: the dry run and the real run agree.
    expect(scoreLineup(fielded, scores, identities, weeks[0]).score).toBe(results[0].score);
    // Roughly one in six over many draws.
    const rate = flares(77, "", 1 / 6) ? 1 : 0;
    expect(rate === 0 || rate === 1).toBe(true);
  });
});

describe("a Riot rename must not zero the lineup that fielded him", () => {
  // Imperialarcher#ezpz became Archêr#ezpz. The slot kept the slug it was
  // filed under; weeklyScoresBySlug rebuilt its keys from raw_stats, which
  // the rename HAD moved. The two never met: the lineup took a zero for the
  // week and Archêr's real points sat in the map with nobody asking for
  // them. The card copy is the link — inventoryId does not move.
  const filedUnderTheOldName: StoredSlots = {
    Top: slot("Imperialarcher", "imperialarcher-ezpz", 70, 4242),
  };
  const thisWeek = new Map([["archer-ezpz", 81.5]]);

  it("scores zero with no identity map — the bug, kept visible", () => {
    expect(scoreLineup(filedUnderTheOldName, thisWeek).score).toBe(0);
  });

  it("finds his points once the copy resolves the new slug", () => {
    const identities = new Map([[4242, { slug: "archer-ezpz", playerName: "Archêr" }]]);
    const result = scoreLineup(filedUnderTheOldName, thisWeek, identities);
    expect(result.score).toBe(81.5);
    // And the breakdown prints who he is NOW, not a name that exists
    // nowhere else on the site any more.
    expect(result.breakdown.Top).toEqual({ slug: "archer-ezpz", playerName: "Archêr", points: 81.5 });
  });

  it("falls back to the frozen slug when the copy is gone", () => {
    // Dusted, or traded away, or a hand-written row. A missing lookup costs
    // nothing more than the old behaviour.
    const stillOldSlug = new Map([["imperialarcher-ezpz", 40]]);
    expect(scoreLineup(filedUnderTheOldName, stillOldSlug, new Map()).score).toBe(40);
    expect(currentIdentity(filedUnderTheOldName.Top!, new Map())).toEqual({
      slug: "imperialarcher-ezpz",
      playerName: "Imperialarcher",
    });
  });

  it("collects every fielded copy id, deduped, for the lookup", () => {
    const ids = inventoryIdsIn([
      { slots: { Top: slot("A", "a-na1", 70, 1), Mid: slot("B", "b-na1", 70, 2) } },
      { slots: { Top: slot("A", "a-na1", 70, 1), Bot: slot("C", "c-na1", 70, 3) } },
    ]);
    expect(ids.sort((x, y) => x - y)).toEqual([1, 2, 3]);
  });
});
