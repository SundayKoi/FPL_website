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
    expect(gameTotals([])).toEqual({ objectives: 0, turrets: 0 });
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
