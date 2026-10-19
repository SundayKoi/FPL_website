import { describe, expect, it } from "vitest";
import { buildMvpState, weekLines } from "./mvp";
import type { OffseasonStatRow } from "./ratings";
import type { OffseasonEventData } from "./types";
import { buildOffseasonView } from "./view";

function row(name: string, matchId: string, overrides: Partial<OffseasonStatRow> = {}): OffseasonStatRow {
  return {
    summoner_name: name,
    tag: "OS1",
    role: "MIDDLE",
    champion: "Ahri",
    win: true,
    game_date: "2026-10-20",
    match_id: matchId,
    team_name: "Team Blue",
    team_side: "Blue",
    game_duration_min: 30,
    kills: 6,
    deaths: 2,
    assists: 9,
    cs: 240,
    total_damage_to_champions: 18_000,
    vision_score: 30,
    ...overrides,
  } as OffseasonStatRow;
}

function data(): OffseasonEventData {
  const entrant = (id: string, role: "mid" | "top") => ({
    id, event_id: "event", profile_id: id === "Mid" ? "me" : null, display_name: id, riot_id: `${id}#OS1`, opgg_url: null, current_rank: null,
    primary_role: role, secondary_role: null, assigned_role: role, status: "active" as const, eliminated_week: null,
    signed_up_at: "2026-10-01T00:00:00Z", locked_in_role: null, locked_in_at: null,
  });
  return {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [entrant("Mid", "mid"), entrant("Top", "top")],
    weeks: [{ id: "w1", event_id: "event", week_number: 1, status: "complete", elimination_per_role: 0, main_draft_id: null, elimination_draft_id: null, draft_at: null, games_at: null, created_at: "" }],
    entries: [],
    teams: [{ id: "tb", week_id: "w1", tier: "main", name: "Team Blue", captain_entrant_id: "Top", draft_team_id: null, eliminated: false }],
    members: [
      { team_id: "tb", entrant_id: "Mid", role: "mid", price: 5 },
      { team_id: "tb", entrant_id: "Top", role: "top", price: 5 },
    ],
    matches: [
      { id: "m1", week_id: "w1", stage: "round_robin", sort_order: 1, team_a_id: "tb", team_b_id: "tr", best_of: 1, winner_team_id: null },
      { id: "m2", week_id: "w1", stage: "round_robin", sort_order: 2, team_a_id: "tb", team_b_id: "tr", best_of: 1, winner_team_id: null },
    ],
    games: [
      { id: "g1", match_id: "m1", game_number: 1, riot_match_id: "NA1_1", winner_team_id: null, ingested_at: "x", ingest_error: null },
      { id: "g2", match_id: "m2", game_number: 1, riot_match_id: "NA1_2", winner_team_id: null, ingested_at: "x", ingest_error: null },
    ],
  };
}

describe("weekLines", () => {
  it("sums a player's week into per-game and per-minute numbers", () => {
    const view = buildOffseasonView(data(), [
      row("Mid", "NA1_1"),
      row("Mid", "NA1_2", { champion: "Syndra", win: false, kills: 2, deaths: 4, assists: 3, cs: 210, game_duration_min: 30 }),
      row("Mid", "NA1_3", { champion: "Zed" }),
    ]);
    const mid = weekLines(view, "w1").get("Mid")!;
    expect(mid).toMatchObject({ games: 2, wins: 1, losses: 1, kills: 4, deaths: 3, assists: 6, kda: 20 / 6, csPerMin: 7.5, damagePerMin: 600, visionPerMin: 1 });
    expect(mid.champions).toEqual(["Ahri", "Syndra"]);
    expect(mid.overall).not.toBeNull();
    expect(weekLines(view, "w1").get("Top")).toMatchObject({ games: 0, overall: null, csPerMin: null, champions: [] });
  });
});

describe("buildMvpState", () => {
  it("opens the week with staff's nominees in order, the viewer marked", () => {
    const view = buildOffseasonView(data(), [row("Mid", "NA1_1")]);
    const state = buildMvpState(view, [{ week_id: "w1", entrant_id: null, votes: 2, final: false }], [], "me", [
      { week_id: "w1", entrant_id: "Top", position: 1 },
      { week_id: "w1", entrant_id: "Mid", position: 2 },
    ]);
    expect(state.open?.nominees.map((nominee) => [nominee.name, nominee.teamName, nominee.self, nominee.line.games])).toEqual([
      ["Top", "Team Blue", false, 0],
      ["Mid", "Team Blue", true, 1],
    ]);
    expect(buildMvpState(view, [{ week_id: "w1", entrant_id: null, votes: 0, final: false }], [], null).open?.nominees).toEqual([]);
  });
});
