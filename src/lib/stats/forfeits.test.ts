import { describe, expect, it } from "vitest";
import { applyForfeits, forfeitRecord, type ForfeitReport } from "./forfeits";
import type { TeamAggRow } from "./types";

const report = (over: Partial<ForfeitReport> = {}): ForfeitReport => ({
  id: "r1",
  season: "S5",
  season_phase: "Regular",
  team_a_name: "OMH",
  team_b_name: "Night Vale",
  score_a: 2,
  score_b: 1,
  forfeit_team_name: "Night Vale",
  games_played: 2,
  ...over,
});

const row = (over: Partial<TeamAggRow> = {}): TeamAggRow => ({
  team_name: "OMH",
  season: "S5",
  season_phase: "Regular",
  games: 6,
  wins: 2,
  losses: 4,
  winrate_pct: 33.3,
  avg_duration_min: 30,
  dragon_rate: 50,
  baron_rate: 50,
  first_blood_rate: 50,
  first_tower_rate: 50,
  avg_team_kills: 20,
  ...over,
});

describe("forfeitRecord", () => {
  it("credits the gap between the score and the games played to the side that did not concede", () => {
    expect(forfeitRecord(report())).toEqual({ season: "S5", season_phase: "Regular", winner: "OMH", loser: "Night Vale", games: 1 });
  });

  it("is nothing when every game in the score was played", () => {
    expect(forfeitRecord(report({ games_played: 3 }))).toBeNull();
  });

  it("never goes negative when more games were listed than scored", () => {
    expect(forfeitRecord(report({ games_played: 5 }))).toBeNull();
  });

  it("knows which side conceded", () => {
    expect(forfeitRecord(report({ forfeit_team_name: "OMH", score_a: 0, score_b: 2, games_played: 0 }))?.winner).toBe("Night Vale");
  });
});

describe("applyForfeits", () => {
  it("adds the conceded game to the record and the win rate, and nothing else", () => {
    const [omh] = applyForfeits([row()], [forfeitRecord(report())!]);
    expect(omh.wins).toBe(3);
    expect(omh.losses).toBe(4);
    expect(omh.games).toBe(7);
    expect(omh.winrate_pct).toBe(42.9);
    expect(omh.forfeit_wins).toBe(1);
    expect(omh.dragon_rate).toBe(50);
    expect(omh.avg_team_kills).toBe(20);
  });

  it("gives the conceding side a loss, with a zero row if it never played", () => {
    const rows = applyForfeits([row()], [forfeitRecord(report())!]);
    const nv = rows.find((r) => r.team_name === "Night Vale")!;
    expect(nv.losses).toBe(1);
    expect(nv.games).toBe(1);
    expect(nv.forfeit_losses).toBe(1);
    expect(nv.winrate_pct).toBe(0);
  });

  it("leaves rows alone when there are no forfeits", () => {
    const rows = [row()];
    expect(applyForfeits(rows, [])).toBe(rows);
  });
});
