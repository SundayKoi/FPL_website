import { describe, expect, it } from "vitest";
import { standings, suggestedEliminations } from "./standings";
import type { MatchStage, OffseasonGame, OffseasonMatch, OffseasonTeam, Tier } from "./types";

const team = (id: string, tier: Tier = "main"): OffseasonTeam => ({
  id,
  week_id: "w1",
  tier,
  name: `Team ${id}`,
  captain_entrant_id: null,
  draft_team_id: null,
  eliminated: false,
});

let order = 0;
function match(a: string, b: string, winner: string | null, stage: MatchStage = "round_robin"): OffseasonMatch {
  order += 1;
  return { id: `${a}-${b}-${order}`, week_id: "w1", stage, sort_order: order, team_a_id: a, team_b_id: b, best_of: 1, winner_team_id: winner };
}

function game(m: OffseasonMatch, number: number, winner: string | null): OffseasonGame {
  return { id: `${m.id}-g${number}`, match_id: m.id, game_number: number, riot_match_id: null, winner_team_id: winner, ingested_at: null, ingest_error: null };
}

describe("standings", () => {
  it("ranks by match wins, then fewer losses, then game difference", () => {
    const teams = [team("A"), team("B"), team("C")];
    const ab = { ...match("A", "B", "A"), best_of: 3 as const };
    const bc = match("B", "C", "B");
    const ca = match("C", "A", "C");
    const games = [game(ab, 1, "A"), game(ab, 2, "A"), game(bc, 1, "B"), game(ca, 1, "C")];
    const table = standings(teams, [ab, bc, ca], games);
    // Every team is 1-1, so game difference decides: A +1, C 0, B -1.
    expect(table.map((row) => row.team.id)).toEqual(["A", "C", "B"]);
    expect(table[0]).toMatchObject({ played: 2, wins: 1, losses: 1, gameWins: 2, gameLosses: 1 });
  });

  it("counts only decided matches", () => {
    const table = standings([team("A"), team("B")], [match("A", "B", null)], []);
    expect(table.every((row) => row.played === 0)).toBe(true);
  });
});

describe("suggestedEliminations", () => {
  const teams = [team("E1", "elimination"), team("E2", "elimination"), team("E3", "elimination"), team("E4", "elimination"), team("M1")];

  it("waits until every elimination match has a winner", () => {
    const matches = [match("E1", "E2", "E1", "elimination"), match("E3", "E4", null, "elimination")];
    expect(suggestedEliminations(teams, matches, [])).toEqual([]);
  });

  it("names the losing elimination teams", () => {
    const matches = [match("E1", "E2", "E1", "elimination"), match("E3", "E4", "E4", "elimination"), match("M1", "E1", "M1")];
    expect(suggestedEliminations(teams, matches, []).map((row) => row.id).sort()).toEqual(["E2", "E3"]);
  });

  it("suggests nothing without elimination matches", () => {
    expect(suggestedEliminations(teams, [match("M1", "E1", "M1")], [])).toEqual([]);
  });
});
