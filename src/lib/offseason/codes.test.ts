import { describe, expect, it } from "vitest";
import { gamesNeedingCodes, parseCodes, teamMatchCodes, weekTeam } from "./codes";
import type { OffseasonEventData, OffseasonMatch, OffseasonMatchCode } from "./types";
import { buildOffseasonView } from "./view";

function match(id: string, a: string, b: string, sort: number, overrides: Partial<OffseasonMatch> = {}): OffseasonMatch {
  return { id, week_id: "w1", stage: "round_robin", sort_order: sort, team_a_id: a, team_b_id: b, best_of: 1, winner_team_id: null, ...overrides };
}

function code(seq: number, matchId: string | null, gameNumber: number | null): OffseasonMatchCode {
  return { id: `c${seq}`, event_id: "event", seq, code: `NA0-CODE-${seq}`, match_id: matchId, game_number: gameNumber };
}

function data(): OffseasonEventData {
  const team = (id: string) => ({ id, week_id: "w1", tier: "main" as const, name: `Team ${id}`, captain_entrant_id: null, draft_team_id: null, eliminated: false });
  return {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [],
    weeks: [{ id: "w1", event_id: "event", week_number: 1, status: "playing", elimination_per_role: 0, main_draft_id: null, elimination_draft_id: null, draft_at: null, games_at: null, created_at: "" }],
    entries: [],
    teams: ["A", "B", "C", "D"].map(team),
    members: ["A", "B", "C", "D"].map((id) => ({ team_id: id, entrant_id: `p${id}`, role: "mid" as const, price: 1 })),
    // Round one is A–B and C–D, round two A–C; then a Bo3 between B and A.
    matches: [match("m1", "A", "B", 1), match("m2", "C", "D", 2), match("m3", "C", "A", 3), match("m4", "B", "A", 4, { stage: "final", best_of: 3 })],
    games: [],
  };
}

describe("parseCodes", () => {
  it("reads a code per line, ignoring blank lines, spaces and commas", () => {
    expect(parseCodes(" NA0-a1\n\nNA0-b2 , NA0-c3\r\nNA0-d4;")).toEqual(["NA0-a1", "NA0-b2", "NA0-c3", "NA0-d4"]);
    expect(parseCodes("   ")).toEqual([]);
  });
});

describe("gamesNeedingCodes", () => {
  it("counts every game without a code or a result", () => {
    const event = data();
    expect(gamesNeedingCodes(event, [])).toBe(6);
    expect(gamesNeedingCodes(event, [code(1, "m1", 1), code(2, "m4", 1), code(3, null, null)])).toBe(4);
  });

  it("leaves out played games, decided matches, finished weeks and a finished event", () => {
    const event = data();
    event.games = [{ id: "g", match_id: "m4", game_number: 1, riot_match_id: null, winner_team_id: "B", ingested_at: null, ingest_error: null }];
    event.matches = event.matches.map((row) => (row.id === "m1" ? { ...row, winner_team_id: "A" } : row));
    expect(gamesNeedingCodes(event, [])).toBe(4);
    expect(gamesNeedingCodes({ ...event, weeks: event.weeks.map((week) => ({ ...week, status: "complete" as const })) }, [])).toBe(0);
    expect(gamesNeedingCodes({ ...event, event: { ...event.event, status: "complete" } }, [])).toBe(0);
  });
});

describe("a player's own matches", () => {
  it("finds the player's team and its matches, in schedule order", () => {
    const view = buildOffseasonView(data(), []);
    const own = weekTeam(view, view.weeks[0], "pA")!;
    expect(own.team.id).toBe("A");
    expect(own.matches.map((row) => row.id)).toEqual(["m1", "m3", "m4"]);
    expect(weekTeam(view, view.weeks[0], "nobody")).toBeNull();
  });

  it("lays out each match with its side, round and a code per game", () => {
    const event = data();
    event.games = [{ id: "g", match_id: "m4", game_number: 1, riot_match_id: null, winner_team_id: "A", ingested_at: null, ingest_error: null }];
    const view = buildOffseasonView(event, []);
    const own = weekTeam(view, view.weeks[0], "pA")!;
    const cards = teamMatchCodes(view, own.team, own.matches, [code(1, "m1", 1), code(2, "m4", 1), code(3, "m4", 2)]);
    expect(cards.map((card) => [card.label, card.opponent, card.side])).toEqual([
      ["Round robin · Game 1", "Team B", "blue"],
      ["Round robin · Game 2", "Team C", "red"],
      ["Final · Bo3", "Team B", "red"],
    ]);
    expect(cards[0].games).toEqual([{ gameNumber: 1, code: "NA0-CODE-1", played: false }]);
    expect(cards[1].games).toEqual([{ gameNumber: 1, code: null, played: false }]);
    expect(cards[2].games).toEqual([
      { gameNumber: 1, code: "NA0-CODE-2", played: true },
      { gameNumber: 2, code: "NA0-CODE-3", played: false },
      { gameNumber: 3, code: null, played: false },
    ]);
    expect(cards[2].score).toEqual([1, 0]);
    expect(cards[2].result).toBeNull();
  });

  it("gives a decided match its result from the team's side", () => {
    const event = data();
    event.matches = event.matches.map((row) => (row.id === "m1" ? { ...row, winner_team_id: "B" } : row));
    event.games = [{ id: "g", match_id: "m1", game_number: 1, riot_match_id: null, winner_team_id: "B", ingested_at: null, ingest_error: null }];
    const view = buildOffseasonView(event, []);
    const own = weekTeam(view, view.weeks[0], "pA")!;
    const [first] = teamMatchCodes(view, own.team, own.matches, []);
    expect(first.result).toBe("lost");
    expect(first.score).toEqual([0, 1]);
  });
});
