import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { PlayerAggRow } from "@/lib/stats/types";
import type { ScoutRosterPlayer } from "@/lib/scouting/types";
import { buildBroadcasterPlayerDetails, type BroadcasterTurretRow } from "./playerDetails";

const statRow = (overrides: Partial<PlayerAggRow> = {}): PlayerAggRow => ({
  summoner_name: "Alpha",
  tag: "NA1",
  season: "S5",
  season_phase: "Regular",
  role_mode: "TOP",
  games: 2,
  wins: 1,
  winrate_pct: 50,
  avg_kills: 2,
  avg_deaths: 1,
  avg_assists: 4,
  kda: 6,
  avg_kp_pct: 50,
  avg_cs_per_min: 7,
  avg_gold_per_min: 400,
  avg_dmg_per_min: 600,
  avg_dmg_share_pct: 25,
  avg_vision_per_min: 1.2,
  avg_solo_kills: 1,
  total_solo_kills: 2,
  total_plates: 1,
  total_doubles: 1,
  total_triples: 0,
  total_quadras: 0,
  total_pentas: 0,
  avg_cs_at_10: 60,
  avg_gold_at_10: 3000,
  avg_xp_at_10: 4000,
  avg_dmg_taken_per_min: 500,
  avg_kda_challenges: 6,
  first_blood_involvements: 1,
  avg_game_duration: 30,
  ...overrides,
});

const roster: ScoutRosterPlayer[] = [
  { id: "alpha-top", displayName: "Captain: Alpha", role: "top" },
  { id: "alpha-support", displayName: "Beta", role: "support" },
];

const cards = [
  { slug: "alpha-card", name: "Alpha", tag: "NA1" },
  { slug: "beta-card", name: "Beta", tag: "NA1" },
] as PlayerCardData[];

describe("buildBroadcasterPlayerDetails", () => {
  it("matches roster players to cards and combines average stats across phases", () => {
    const turretRows: BroadcasterTurretRow[] = [
      { summoner_name: "Alpha", tag: "NA1", turret_kills: 2 },
      { summoner_name: "Alpha", tag: "NA1", turret_kills: 1 },
      { summoner_name: "Alpha", tag: "NA1", turret_kills: 0 },
      { summoner_name: "Beta", tag: "NA1", turret_kills: 0 },
    ];

    const details = buildBroadcasterPlayerDetails(
      roster,
      cards,
      [
        statRow(),
        statRow({ season_phase: "Playoffs", games: 1, wins: 1, avg_dmg_per_min: 800 }),
        statRow({ summoner_name: "Beta", role_mode: "UTILITY" }),
      ],
      turretRows,
      "S5",
    );

    expect(details).toHaveLength(2);
    expect(details[0]).toMatchObject({
      playerId: "alpha-top",
      card: { slug: "alpha-card" },
      averages: { games: 3, damagePerMin: expect.closeTo(666.67, 0.01), turretsPerGame: 1 },
    });
    expect(details[1]).toMatchObject({
      playerId: "alpha-support",
      card: { slug: "beta-card" },
      averages: { games: 2, turretsPerGame: 0 },
    });
  });
});
