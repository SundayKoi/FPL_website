import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import WeeklyStandouts from "./WeeklyStandouts";
import type { WeeklyStandout } from "@/lib/stats/weekly";

const standouts: WeeklyStandout[] = [
  {
    summoner_name: "MetaShift",
    tag: "FPL",
    season: "S5",
    season_phase: "Regular",
    role_mode: "MIDDLE",
    games: 2,
    wins: 2,
    winrate_pct: 100,
    avg_kills: 9,
    avg_deaths: 1.5,
    avg_assists: 7,
    kda: 10.67,
    avg_kp_pct: 71,
    avg_cs_per_min: 8.4,
    avg_gold_per_min: 440,
    avg_dmg_per_min: 820,
    avg_dmg_share_pct: 34,
    avg_vision_per_min: 1.1,
    avg_solo_kills: 1,
    total_solo_kills: 2,
    total_plates: 4,
    total_doubles: 2,
    total_triples: 0,
    total_quadras: 0,
    total_pentas: 0,
    avg_cs_at_10: 82,
    avg_gold_at_10: 3600,
    avg_xp_at_10: 4700,
    avg_dmg_taken_per_min: 500,
    avg_kda_challenges: 10.67,
    first_blood_involvements: 1,
    avg_game_duration: 30,
    score: 88.8,
  },
];

afterEach(() => {
  cleanup();
});

describe("WeeklyStandouts", () => {
  it("renders top weekly players with their power score", () => {
    render(<WeeklyStandouts standouts={standouts} />);

    expect(screen.getByRole("article", { name: /latest week's standouts/i })).not.toBeNull();
    expect(screen.getByText("MetaShift")).not.toBeNull();
    expect(screen.getByText("88.8")).not.toBeNull();
    expect(screen.getByText(/power score/i)).not.toBeNull();
  });

  it("renders an empty state when weekly stats are unavailable", () => {
    render(<WeeklyStandouts standouts={[]} />);

    expect(screen.getByText(/weekly standouts will appear/i)).not.toBeNull();
  });
});
