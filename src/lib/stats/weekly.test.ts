import { describe, expect, it } from "vitest";
import {
  aggregateWeeklyPlayerRows,
  type WeeklyRawStatRow,
} from "./weekly";

function raw(overrides: Partial<WeeklyRawStatRow> = {}): WeeklyRawStatRow {
  return {
    summoner_name: "Player",
    tag: "NA1",
    season: "S5",
    season_phase: "Regular",
    role: "MIDDLE",
    game_duration_min: 30,
    kills: 5,
    deaths: 2,
    assists: 7,
    solo_kills: 1,
    kill_participation_pct: 60,
    cs: 240,
    cs_per_min: 8,
    gold_earned: 12_000,
    gold_per_min: 400,
    total_damage_to_champions: 21_000,
    damage_per_min: 700,
    damage_share_pct: 30,
    vision_score: 30,
    vision_score_per_min: 1,
    turret_plates_destroyed: 2,
    double_kills: 1,
    triple_kills: 0,
    quadra_kills: 0,
    penta_kills: 0,
    cs_at_10: 80,
    gold_at_10: 3_400,
    xp_at_10: 4_700,
    damage_taken_per_min: 520,
    kda_challenges: 6,
    first_blood_kill: false,
    first_blood_assist: false,
    win: true,
    ...overrides,
  };
}

describe("aggregateWeeklyPlayerRows", () => {
  it("combines raw weekly games into PlayerAggRow values", () => {
    const [row] = aggregateWeeklyPlayerRows([
      raw({ kills: 8, deaths: 2, assists: 4, win: true, role: "MIDDLE" }),
      raw({
        kills: 2,
        deaths: 3,
        assists: 11,
        win: false,
        role: "MIDDLE",
        game_duration_min: 20,
        cs: 120,
        gold_earned: 7_000,
        total_damage_to_champions: 10_000,
        vision_score: 28,
      }),
    ]);

    expect(row).toMatchObject({
      summoner_name: "Player",
      tag: "NA1",
      season: "S5",
      season_phase: "Regular",
      role_mode: "MIDDLE",
      games: 2,
      wins: 1,
      winrate_pct: 50,
      avg_kills: 5,
      avg_deaths: 2.5,
      avg_assists: 7.5,
      kda: 5,
      avg_cs_per_min: 7.2,
      avg_gold_per_min: 380,
      avg_dmg_per_min: 620,
      avg_vision_per_min: 1.16,
    });
  });
});
