import { describe, expect, it } from "vitest";
import type { CardGameRow } from "./build";
import { DEFAULT_BARS, ROLE_BARS, gameTotals, pctOf } from "./measures";

const game = (over: Partial<CardGameRow> = {}): CardGameRow => ({
  summoner_name: "Player",
  tag: "NA1",
  champion: "Jhin",
  win: true,
  game_date: "2026-08-01T00:00:00Z",
  match_id: "NA1_1",
  team_name: "Gamblers",
  kills: 5,
  deaths: 3,
  assists: 6,
  cs: 200,
  total_damage_to_champions: 20000,
  ...over,
});

describe("gameTotals", () => {
  it("averages objective and turret work per game", () => {
    const totals = gameTotals([
      game({ dragon_kills: 2, baron_kills: 1, objective_damage: 9000, turret_kills: 1, turret_damage: 4000, turret_plates_destroyed: 2 }),
      game({ dragon_kills: 0, baron_kills: 1, objective_damage: 3000, turret_kills: 1, turret_damage: 2000, turret_plates_destroyed: 0 }),
    ]);
    // (2+1 + 0+1) / 2 = 2 takedowns, (9000+3000)/2 = 6000 damage
    expect(totals.objectives).toBeCloseTo(2 + 6000 / 1000, 5);
    // (1+1)/2 = 1 turret, (4000+2000)/2 = 3000 damage, (2+0)/2 = 1 plate
    expect(totals.turrets).toBeCloseTo(1 + 3000 / 1000 + 1, 5);
  });

  it("treats missing columns as zero rather than NaN", () => {
    const totals = gameTotals([game()]);
    expect(totals.objectives).toBe(0);
    expect(totals.turrets).toBe(0);
  });

  it("returns zeroes for a player with no games", () => {
    expect(gameTotals([])).toEqual({ objectives: 0, turrets: 0, visionWork: 0 });
  });
});

describe("pctOf", () => {
  it("ranks a value within the cohort, 0 worst and 100 best", () => {
    expect(pctOf([1, 2, 3, 4, 5], 5)).toBe(100);
    expect(pctOf([1, 2, 3, 4, 5], 1)).toBe(0);
    expect(pctOf([1, 2, 3, 4, 5], 3)).toBe(50);
  });

  it("gives a lone player the middle rather than dividing by zero", () => {
    expect(pctOf([7], 7)).toBe(50);
  });

  it("puts everyone at the middle when the whole cohort ties", () => {
    // A week where nobody took an objective must not read as five 99s.
    expect(pctOf([0, 0, 0, 0], 0)).toBe(50);
  });
});

describe("ROLE_BARS", () => {
  it("gives all five roles exactly five bars, starting at Combat", () => {
    for (const role of ["TOP", "JUNGLE", "MIDDLE", "BOTTOM", "UTILITY"]) {
      expect(ROLE_BARS[role], role).toHaveLength(5);
      expect(ROLE_BARS[role][0], role).toBe("combat");
    }
  });

  it("gives each role its signature measure", () => {
    expect(ROLE_BARS.TOP).toContain("turrets");
    expect(ROLE_BARS.JUNGLE).toContain("objectives");
    expect(ROLE_BARS.UTILITY).toContain("vision");
    expect(ROLE_BARS.BOTTOM).toContain("damage");
    expect(ROLE_BARS.MIDDLE).toContain("damage");
  });

  it("has a five-bar default for an unknown role", () => {
    expect(DEFAULT_BARS).toHaveLength(5);
    expect(ROLE_BARS.SOMETHING_ELSE).toBeUndefined();
  });
});

describe("gameTotals game-length normalisation", () => {
  const game = (matchId: string, over: Partial<CardGameRow> = {}): CardGameRow =>
    ({
      match_id: matchId,
      summoner_name: "Ari",
      tag: "NA1",
      champion: null,
      win: true,
      game_date: null,
      team_name: null,
      kills: 0,
      deaths: 0,
      assists: 0,
      cs: 0,
      total_damage_to_champions: 0,
      dragon_kills: 0,
      baron_kills: 0,
      objective_damage: 0,
      turret_kills: 0,
      turret_damage: 0,
      turret_plates_destroyed: 0,
      ...over,
    }) as CardGameRow;

  it("rates identical work in a long and a short game the same", () => {
    // Two dragons in 40 minutes is the same rate as one in 20 — the
    // per-game count said the long game was twice as good.
    const long = gameTotals([game("m1", { dragon_kills: 2 })], new Map([["m1", 40]]));
    const short = gameTotals([game("m2", { dragon_kills: 1 })], new Map([["m2", 20]]));
    expect(long.objectives).toBeCloseTo(short.objectives, 6);
  });

  it("ranks real efficiency above raw accumulation", () => {
    const grinder = gameTotals([game("m1", { baron_kills: 2 })], new Map([["m1", 50]]));
    const efficient = gameTotals([game("m2", { baron_kills: 2 })], new Map([["m2", 25]]));
    expect(efficient.objectives).toBeGreaterThan(grinder.objectives);
  });

  it("keeps plates per game, since plating only exists before 14 minutes", () => {
    // A long game offers no extra plates, so dividing them by its duration
    // would penalise the player for minutes they could not farm plates in.
    const long = gameTotals([game("m1", { turret_plates_destroyed: 3 })], new Map([["m1", 45]]));
    const short = gameTotals([game("m2", { turret_plates_destroyed: 3 })], new Map([["m2", 22]]));
    expect(long.turrets).toBeCloseTo(short.turrets, 6);
  });

  it("falls back to per-game when no duration is known", () => {
    // A solo build has no game log; every player in that cohort shares the
    // old scale, so the percentiles still rank correctly against each other.
    const totals = gameTotals([game("m1", { dragon_kills: 2 })]);
    expect(totals.objectives).toBe(2);
  });
})

describe("pctOf tie handling", () => {
  it("gives identical values identical percentiles", () => {
    // The bug this replaces: ranking by sort position handed four players
    // with the SAME 2-0 record percentiles of 40, 60, 80 and 100 — up to
    // 13 OVR of pure array-order noise once winning was weighted at 30.
    const wrs = [100, 100, 100, 100, 0, 0];
    const first = pctOf(wrs, 100);
    expect(pctOf(wrs, 100)).toBe(first);
    expect(pctOf(wrs, 0)).toBeLessThan(first);
  });

  it("splits a tied band down its middle rather than pinning it low", () => {
    // Four of six at the top: the band spans ranks 2..5 of 0..5, so its
    // midpoint is 3.5/5 = 70.
    expect(pctOf([100, 100, 100, 100, 0, 0], 100)).toBeCloseTo(70, 6);
    expect(pctOf([100, 100, 100, 100, 0, 0], 0)).toBeCloseTo(10, 6);
  });

  it("still puts a unique best at the top and a unique worst at the bottom", () => {
    expect(pctOf([1, 2, 3], 3)).toBe(100);
    expect(pctOf([1, 2, 3], 1)).toBe(0);
    expect(pctOf([1, 2, 3], 2)).toBe(50);
  });

  it("returns the middle when everybody ties, or the value is absent", () => {
    expect(pctOf([5, 5, 5], 5)).toBe(50);
    expect(pctOf([1, 2, 3], 99)).toBe(50);
  });
})

describe("vision work", () => {
  const warding = (matchId: string, killed: number, control: number): CardGameRow =>
    ({
      match_id: matchId, summoner_name: "Ari", tag: "NA1", champion: null, win: true,
      game_date: null, team_name: null, kills: 0, deaths: 0, assists: 0, cs: 0,
      total_damage_to_champions: 0, wards_killed: killed, control_wards_bought: control,
    }) as CardGameRow;

  it("prefers control wards PLACED over control wards bought", () => {
    // Buying is an intention; placing is the act. A control ward left in
    // the inventory lights nothing up for anybody.
    const placed = ({
      match_id: "m1", summoner_name: "Ari", tag: "NA1", champion: null, win: true,
      game_date: null, team_name: null, kills: 0, deaths: 0, assists: 0, cs: 0,
      total_damage_to_champions: 0, wards_killed: 0,
      control_wards_bought: 10, detector_wards_placed: 2,
    }) as CardGameRow;
    // 2 placed / 20 min, not 10 bought / 20 min.
    expect(gameTotals([placed], new Map([["m1", 20]])).visionWork).toBeCloseTo(0.1, 6);
  });

  it("falls back to purchases when the placed figure was never ingested", () => {
    const noPlaced = ({
      match_id: "m1", summoner_name: "Ari", tag: "NA1", champion: null, win: true,
      game_date: null, team_name: null, kills: 0, deaths: 0, assists: 0, cs: 0,
      total_damage_to_champions: 0, wards_killed: 0, control_wards_bought: 10,
    }) as CardGameRow;
    // Missing, not zero: a partial row should still count for something.
    expect(gameTotals([noPlaced], new Map([["m1", 20]])).visionWork).toBeCloseTo(0.5, 6);
  });

  it("counts denial and the control wards paid for", () => {
    const totals = gameTotals([warding("m1", 6, 4)], new Map([["m1", 20]]));
    expect(totals.visionWork).toBeCloseTo(0.5, 6);
  });

  it("gives a longer game no free credit for the same work", () => {
    // Spies' case: more raw vision across more minutes is not more vision.
    const long = gameTotals([warding("m1", 10, 6)], new Map([["m1", 40]]));
    const short = gameTotals([warding("m2", 5, 3)], new Map([["m2", 20]]));
    expect(long.visionWork).toBeCloseTo(short.visionWork, 6);
  });

  it("separates a ward hunter from someone who only holds uptime", () => {
    const hunter = gameTotals([warding("m1", 12, 5)], new Map([["m1", 30]]));
    const passive = gameTotals([warding("m2", 1, 1)], new Map([["m2", 30]]));
    expect(hunter.visionWork).toBeGreaterThan(passive.visionWork);
  });
})
