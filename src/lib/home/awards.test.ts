import { describe, expect, it } from "vitest";
import { bundledSeason4Rows, deriveHomepageAwards, type HomepageRawStatRow } from "./awards";

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
    cs: 240,
    gold_earned: 14000,
    vision_score: 25,
    win: true,
    season: "S4",
    season_phase: "Regular",
    game_duration_min: 30,
    team_dragons: 3,
    team_barons: 1,
    team_first_blood: true,
    team_first_tower: true,
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
  it("selects the latest Season 4 player and team performers", () => {
    const result = deriveHomepageAwards(rows, new Map([["Ace#FPL", 8]]));

    expect(result.season).toBe("S4");
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

  it("derives populated honors from the stored Season 4 stats bundle", () => {
    const result = deriveHomepageAwards(bundledSeason4Rows(), new Map());

    expect(result.standings.length).toBeGreaterThan(0);
    expect(result.playerOfWeek.name).toBeTruthy();
    expect(result.teamOfWeek.teamName).toBeTruthy();
    expect(result.periodLabel).toMatch(/Week of/);
  });
});
