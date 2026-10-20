import { describe, expect, it } from "vitest";
import type { LolRole } from "@/lib/draft/types";
import { draftStates, draftSummaryGames, draftTeam, matchLabel, teamAbbreviation, viewerCaptainOf, type OffseasonDraftRow } from "./drafts";
import type { OffseasonEntrant, OffseasonEventData } from "./types";
import { buildOffseasonView } from "./view";

const ROLES: LolRole[] = ["support", "top", "adc", "jungle", "mid"];

function entrant(id: string, role: LolRole, profileId: string | null = null): OffseasonEntrant {
  return {
    id,
    event_id: "event",
    profile_id: profileId,
    display_name: id,
    riot_id: `${id}#OS1`,
    opgg_url: null,
    current_rank: null,
    primary_role: role,
    secondary_role: null,
    assigned_role: role,
    status: "active",
    eliminated_week: null,
    signed_up_at: "2026-10-01T00:00:00Z",
    locked_in_role: null,
    locked_in_at: null,
  };
}

/** Team Doki (captain on account u-doki) against Team Flyinq squirtle in a Bo3. */
function view() {
  const players = (["Doki", "Fly"] as const).flatMap((team) =>
    ROLES.map((role) => entrant(`${team} ${role}`, role, role === "top" ? `u-${team.toLowerCase()}` : null)),
  );
  const data: OffseasonEventData = {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: players,
    weeks: [{ id: "w3", event_id: "event", week_number: 3, status: "playing", elimination_per_role: 2, main_draft_id: null, elimination_draft_id: null, draft_at: null, games_at: null, created_at: "" }],
    entries: [],
    teams: [
      { id: "td", week_id: "w3", tier: "elimination", name: "Team Doki", captain_entrant_id: "Doki top", draft_team_id: null, eliminated: false },
      { id: "tf", week_id: "w3", tier: "elimination", name: "Team Flyinq squirtle", captain_entrant_id: "Fly top", draft_team_id: null, eliminated: false },
    ],
    members: players.map((player) => ({ team_id: player.id.startsWith("Doki") ? "td" : "tf", entrant_id: player.id, role: player.assigned_role!, price: 5 })),
    matches: [{ id: "m1", week_id: "w3", stage: "elimination", sort_order: 1, team_a_id: "td", team_b_id: "tf", best_of: 3, winner_team_id: null }],
    games: [{ id: "g1", match_id: "m1", game_number: 1, riot_match_id: "NA1_1000000001", winner_team_id: "tf", ingested_at: "2026-10-20", ingest_error: null }],
  };
  return buildOffseasonView(data, []);
}

function row(gameNumber: number, overrides: Partial<OffseasonDraftRow> = {}): OffseasonDraftRow {
  return {
    id: `d${gameNumber}`,
    revision: gameNumber,
    match_id: "m1",
    game_number: gameNumber,
    status: "complete",
    current_step_index: 19,
    turn_started_at: null,
    turn_deadline_at: null,
    turn_allowance_seconds: null,
    blue_pending_overtime_seconds: 0,
    red_pending_overtime_seconds: 0,
    blue_team_name: null,
    red_team_name: null,
    blue_ready: true,
    red_ready: true,
    change_request: null,
    positions: null,
    winner_team: null,
    actions: [
      { stepIndex: 0, side: "blue", kind: "ban", slot: 1, champion: "Zed" },
      { stepIndex: 6, side: "blue", kind: "pick", slot: 1, champion: "Ahri" },
      { stepIndex: 1, side: "red", kind: "ban", slot: 1, champion: null, skipped: true },
    ],
    created_at: "",
    updated_at: "",
    ...overrides,
  };
}

describe("offseason drafts", () => {
  it("shortens team names for the board and lists players top to support", () => {
    expect([teamAbbreviation("Team Doki"), teamAbbreviation("Team Flyinq squirtle"), teamAbbreviation("Supercalifragilistic")]).toEqual([
      "DOKI",
      "FLYINQ",
      "SUPERCAL",
    ]);
    const v = view();
    expect(draftTeam(v, v.teamsById.get("td"), "Blue")).toEqual({
      name: "Team Doki",
      abbreviation: "DOKI",
      imageUrl: null,
      players: ["Doki top", "Doki jungle", "Doki mid", "Doki adc", "Doki support"],
    });
    expect(matchLabel(v, v.matches[0])).toBe("Week 3 · Elimination · Bo3");
  });

  it("knows which team the viewer captains, by account", () => {
    const v = view();
    expect(viewerCaptainOf(v, v.matches[0], "u-fly")?.name).toBe("Team Flyinq squirtle");
    expect(viewerCaptainOf(v, v.matches[0], "someone else")).toBeNull();
    expect(viewerCaptainOf(v, v.matches[0], null)).toBeNull();
  });

  it("starts every game of the match, fearless and with the sides chosen", () => {
    const v = view();
    const { states, games } = draftStates({
      view: v,
      match: v.matches[0],
      rows: [row(1), row(2, { status: "drafting", actions: [], blue_team_name: "Team Flyinq squirtle", red_team_name: "Team Doki" })],
      layout: "board",
    });
    expect(games).toEqual([
      { gameNumber: 1, href: "/offseason/draft/m1?game=1", status: "complete" },
      { gameNumber: 2, href: "/offseason/draft/m1?game=2", status: "drafting" },
      { gameNumber: 3, href: "/offseason/draft/m1?game=3", status: null },
    ]);
    expect(states.map((state) => [state.blueTeam.name, state.sideChoiceRequired, state.blockedChampions])).toEqual([
      ["Team Doki", false, []],
      ["Team Flyinq squirtle", false, ["Ahri"]],
      ["Team Doki", true, ["Ahri"]],
    ]);
    expect(states[0].actions).toHaveLength(3);
    expect(states[1].fixtureId).toBe("m1");
  });

  it("gives the history each drafted game with its real winner", () => {
    const v = view();
    const games = draftSummaryGames(v, v.matches[0], [row(2, { winner_team: "Team Doki" }), row(1, { winner_team: "Team Doki" })]);
    expect(games.map((game) => [game.gameNumber, game.blueTeamName, game.redTeamName, game.winnerTeam])).toEqual([
      [1, "Team Doki", "Team Flyinq squirtle", "Team Flyinq squirtle"],
      [2, "Team Doki", "Team Flyinq squirtle", "Team Doki"],
    ]);
  });
});
