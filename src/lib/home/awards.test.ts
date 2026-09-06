import { describe, expect, it } from "vitest";
import { deriveHomepageAwards, type HomepageRawStatRow } from "./awards";

type RowOverrides = Partial<HomepageRawStatRow>;

function row(overrides: RowOverrides = {}): HomepageRawStatRow {
  return {
    game_date: "2026-04-27 20:00:00",
    match_id: "match-1",
    team_side: "Blue",
    team_name: "MetaShift League",
    summoner_name: "Ace",
    tag: "FPL",
    champion: "Ahri",
    role: "MIDDLE",
    kills: 8,
    deaths: 1,
    assists: 7,
    kill_participation_pct: 78,
    total_damage_to_champions: 25000,
    win: true,
    season: "S5",
    season_phase: "Regular",
    game_duration_min: 30,
    team_dragons: 3,
    team_barons: 1,
    team_first_blood: true,
    team_first_tower: true,
    cs: 240,
    cs_at_10: 80,
    cs_per_min: 8,
    damage_per_min: 833,
    damage_share_pct: 28,
    damage_taken_per_min: 500,
    double_kills: 1,
    first_blood_assist: false,
    first_blood_kill: true,
    gold_at_10: 3400,
    gold_earned: 13500,
    gold_per_min: 450,
    kda_challenges: 5,
    penta_kills: 0,
    quadra_kills: 0,
    solo_kills: 1,
    triple_kills: 0,
    turret_plates_destroyed: 2,
    vision_score: 30,
    vision_score_per_min: 1,
    xp_at_10: 4800,
    ...overrides,
  };
}

function weekRows(
  teamName: string,
  week: string,
  wins: boolean[],
  player = "Ace",
): HomepageRawStatRow[] {
  return wins.map((win, index) =>
    row({
      game_date: `${week} ${String(20 + index).padStart(2, "0")}:00:00`,
      match_id: `${teamName}-${week}-${index}`,
      team_name: teamName,
      summoner_name: player,
      win,
      kills: win ? 8 : 2,
      deaths: win ? 1 : 6,
    }),
  );
}

const rows = [
  ...weekRows("Wildcats", "2026-04-06", [true, false], "Reliable"),
  ...weekRows("Wildcats", "2026-04-13", [true, false], "Reliable"),
  ...weekRows("Wildcats", "2026-04-20", [true, false], "Reliable"),
  ...weekRows("Wildcats", "2026-04-27", [true, false], "Reliable"),
  ...weekRows("MetaShift League", "2026-04-06", [false, false], "Ace"),
  ...weekRows("MetaShift League", "2026-04-13", [false, true], "Ace"),
  ...weekRows("MetaShift League", "2026-04-20", [true, false], "Ace"),
  ...weekRows("MetaShift League", "2026-04-27", [true, true], "Ace"),
  row({ season: "S3", team_name: "Old Team", summoner_name: "Old Player", win: true }),
];

describe("deriveHomepageAwards", () => {
  it("selects the latest Season 5 player and team performers", () => {
    const result = deriveHomepageAwards(rows, new Map([["Ace#FPL", 8]]));

    expect(result.season).toBe("S5");
    expect(result.playerOfWeek.name).toBe("Ace");
    expect(result.teamOfWeek.teamName).toBe("MetaShift League");
    expect(result.periodLabel).toMatch(/Week/);
  });

  it("requires a positive price for Best Value Pick", () => {
    const result = deriveHomepageAwards(rows, new Map([["Ace#FPL", 0]]));

    expect(result.individualAwards.find((award) => award.title === "Best Value Pick")?.name).toBeNull();
  });

  it("ranks Most Reliable by the lowest weekly win-rate volatility", () => {
    const result = deriveHomepageAwards(rows, new Map([["Ace#FPL", 8]]));

    expect(result.teamAwards.find((award) => award.title === "Most Reliable")?.teamName).toBe("Wildcats");
  });

  it("ignores rows from other seasons", () => {
    const result = deriveHomepageAwards(
      [
        row({ season: "S4", team_name: "Historical Team", summoner_name: "Historical Player" }),
        row({ season: "S5", team_name: "Current Team", summoner_name: "Current Player" }),
      ],
      new Map(),
    );

    expect(result.playerOfWeek.name).toBeNull();
    expect(result.teamOfWeek.teamName).toBe("Current Team");
  });

  it("returns an unavailable S5 result when no S5 rows exist", () => {
    const result = deriveHomepageAwards([row({ season: "S4" })], new Map());

    expect(result.season).toBe("S5");
    expect(result.playerOfWeek.name).toBeNull();
    expect(result.teamOfWeek.teamName).toBeNull();
  });
});

