import { describe, expect, it } from "vitest";
import type { OffseasonStatRow } from "./ratings";
import { bestGames, leaders, playerStats, summarizeRows } from "./stats";
import type { OffseasonEntrant, OffseasonEventData } from "./types";
import { buildOffseasonView } from "./view";

function row(name: string, matchId: string, overrides: Partial<OffseasonStatRow> = {}): OffseasonStatRow {
  return {
    summoner_name: name, tag: "OS1", role: "MIDDLE", champion: "Ahri", win: true, game_date: "2026-10-20", match_id: matchId,
    team_name: "Team Blue", team_side: "Blue", game_duration_min: 30, kills: 6, deaths: 2, assists: 9, cs: 240,
    total_damage_to_champions: 18_000, vision_score: 30, kill_participation_pct: 60,
    ...overrides,
  } as OffseasonStatRow;
}

function entrant(id: string): OffseasonEntrant {
  return {
    id, event_id: "event", profile_id: null, display_name: id, riot_id: `${id}#OS1`, opgg_url: null, current_rank: null,
    primary_role: "mid", secondary_role: null, assigned_role: "mid", status: "active", eliminated_week: null,
    signed_up_at: "2026-10-01T00:00:00Z", locked_in_role: null, locked_in_at: null,
  };
}

/** Two weeks: Ann and Bo play for Blue then Red; Cy only in week 2. */
function event(): OffseasonEventData {
  const week = (n: number) => ({ id: `w${n}`, event_id: "event", week_number: n, status: "complete" as const, elimination_per_role: 0, main_draft_id: null, elimination_draft_id: null, draft_at: null, games_at: null, created_at: "" });
  const team = (id: string, weekId: string, name: string) => ({ id, week_id: weekId, tier: "main" as const, name, captain_entrant_id: null, draft_team_id: null, eliminated: false });
  const match = (id: string, weekId: string, a: string, b: string, winner: string) => ({ id, week_id: weekId, stage: "round_robin" as const, sort_order: 1, team_a_id: a, team_b_id: b, best_of: 1 as const, winner_team_id: winner });
  const game = (id: string, matchId: string, riot: string, winner: string) => ({ id, match_id: matchId, game_number: 1, riot_match_id: riot, winner_team_id: winner, ingested_at: "x", ingest_error: null });
  return {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [entrant("Ann"), entrant("Bo"), entrant("Cy")],
    weeks: [week(1), week(2)],
    entries: [],
    teams: [team("t1", "w1", "Team Ann"), team("t2", "w1", "Team Bo"), team("t3", "w2", "Team Cy"), team("t4", "w2", "Team Bo 2")],
    members: [
      { team_id: "t1", entrant_id: "Ann", role: "mid", price: 1 },
      { team_id: "t2", entrant_id: "Bo", role: "mid", price: 1 },
      { team_id: "t3", entrant_id: "Cy", role: "mid", price: 1 },
      { team_id: "t3", entrant_id: "Ann", role: "top", price: 1 },
      { team_id: "t4", entrant_id: "Bo", role: "mid", price: 1 },
    ],
    matches: [match("m1", "w1", "t1", "t2", "t1"), match("m2", "w2", "t3", "t4", "t4")],
    games: [game("g1", "m1", "NA1_1", "t1"), game("g2", "m2", "NA1_2", "t4")],
  };
}

const rows = [
  row("Ann", "NA1_1", { kills: 12, deaths: 1, assists: 4, champion: "Zed" }),
  row("Bo", "NA1_1", { win: false, kills: 2, deaths: 6, assists: 3, kill_participation_pct: 40 }),
  row("Ann", "NA1_2", { win: false, kills: 3, deaths: 3, assists: 3, role: "TOP" }),
  row("Cy", "NA1_2", { win: false, kills: 5, deaths: 0, assists: 10, played_by: "Ringer#XYZ" }),
  row("Bo", "NA1_2", { kills: 8, deaths: 2, assists: 5 }),
];

describe("summarizeRows", () => {
  it("averages per game and per minute, kill participation included", () => {
    const line = summarizeRows([row("Ann", "a"), row("Ann", "b", { kill_participation_pct: 40, kills: 2, deaths: 4, assists: 3, cs: 210 })]);
    expect(line).toMatchObject({ games: 2, wins: 2, kills: 4, deaths: 3, assists: 6, csPerMin: 7.5, damagePerMin: 600, visionPerMin: 1, killParticipation: 50 });
    expect(summarizeRows([])).toMatchObject({ games: 0, kda: 0, csPerMin: null, killParticipation: null, champions: [] });
  });
});

describe("playerStats", () => {
  it("covers the whole event with each player's season record", () => {
    const view = buildOffseasonView(event(), rows);
    const all = playerStats(view, null);
    expect(all.map((player) => [player.name, player.line.games, player.wins, player.losses, player.team])).toEqual([
      ["Ann", 2, 1, 1, null],
      ["Bo", 2, 1, 1, null],
      ["Cy", 1, 0, 1, null],
    ]);
    expect(all.find((player) => player.name === "Ann")!.line.champions).toEqual(["Ahri", "Zed"]);
  });

  it("narrows to one week, with that week's team, role, record and Overall", () => {
    const view = buildOffseasonView(event(), rows);
    const week2 = playerStats(view, 2);
    expect(week2.map((player) => [player.name, player.team, player.role, player.wins, player.losses])).toEqual([
      ["Ann", "Team Cy", "top", 0, 1],
      ["Bo", "Team Bo 2", "mid", 1, 0],
      ["Cy", "Team Cy", "mid", 0, 1],
    ]);
    const ann = week2.find((player) => player.name === "Ann")!;
    expect(ann.overall).toBe(view.ratings.get("Ann")!.weekly.find((line) => line.week === 2)!.overall);
  });
});

describe("leaders and best games", () => {
  it("ranks each category among players with enough games", () => {
    const view = buildOffseasonView(event(), rows);
    const boards = leaders(playerStats(view, null), 2);
    // Cy's one game would top KDA, but takes two to qualify.
    expect(boards.kda.map((player) => player.name)).toEqual(["Ann", "Bo"]);
    expect(leaders(playerStats(view, 2), 1).kda[0].name).toBe("Cy");
  });

  it("lists the biggest single games, and who really played them", () => {
    const view = buildOffseasonView(event(), rows);
    const best = bestGames(view, null);
    expect(best.kills.map((game) => [game.name, game.kills, game.weekNumber])).toEqual([
      ["Ann", 12, 1],
      ["Bo", 8, 2],
      ["Cy", 5, 2],
      ["Ann", 3, 2],
      ["Bo", 2, 1],
    ]);
    expect(best.kda[0]).toMatchObject({ name: "Ann", kda: 16 });
    expect(best.kda.find((game) => game.name === "Cy")!.playedBy).toBe("Ringer#XYZ");
    expect(bestGames(view, 1).kills.map((game) => game.name)).toEqual(["Ann", "Bo"]);
  });
});
