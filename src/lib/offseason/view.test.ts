import { describe, expect, it } from "vitest";
import type { OffseasonEventData, OffseasonMatch, OffseasonTeam } from "./types";
import { buildOffseasonView } from "./view";

const team = (id: string): OffseasonTeam => ({
  id,
  week_id: "w2",
  tier: "main",
  name: `Team ${id}`,
  captain_entrant_id: null,
  draft_team_id: null,
  eliminated: false,
});

const match = (id: string, stage: OffseasonMatch["stage"], winner: string | null): OffseasonMatch => ({
  id,
  week_id: "w2",
  stage,
  sort_order: 1,
  team_a_id: "A",
  team_b_id: "B",
  best_of: 5,
  winner_team_id: winner,
});

function data(matches: OffseasonMatch[]): OffseasonEventData {
  return {
    event: { id: "e", name: "Offseason", status: "finals", signups_open: false, yardstick_season: "S6", created_at: "2026-10-01T00:00:00Z" },
    entrants: [],
    weeks: [
      { id: "w1", event_id: "e", week_number: 1, status: "complete", elimination_per_role: 0, main_draft_id: null, elimination_draft_id: null, created_at: "" },
      { id: "w2", event_id: "e", week_number: 2, status: "playing", elimination_per_role: 0, main_draft_id: null, elimination_draft_id: null, created_at: "" },
    ],
    entries: [],
    teams: [team("A"), team("B")],
    members: [
      { team_id: "A", entrant_id: "p1", role: "top", price: 5 },
      { team_id: "A", entrant_id: "p2", role: "mid", price: null },
    ],
    matches,
    games: [
      { id: "g2", match_id: "m1", game_number: 2, riot_match_id: null, winner_team_id: null, ingested_at: null, ingest_error: null },
      { id: "g1", match_id: "m1", game_number: 1, riot_match_id: "NA1_1000000001", winner_team_id: "A", ingested_at: null, ingest_error: null },
    ],
  };
}

describe("buildOffseasonView", () => {
  it("indexes the event and picks the newest week", () => {
    const view = buildOffseasonView(data([match("m1", "round_robin", null)]), []);
    expect(view.currentWeek?.week_number).toBe(2);
    expect(view.membersByTeam.get("A")).toHaveLength(2);
    expect(view.gamesByMatch.get("m1")?.map((game) => game.id)).toEqual(["g2", "g1"]);
    expect(view.weekById.get("w1")?.status).toBe("complete");
    expect(view.champion).toBeNull();
  });

  it("names the final's winner as champion", () => {
    const view = buildOffseasonView(data([match("m1", "semifinal", "B"), match("m2", "final", "A")]), []);
    expect(view.champion?.id).toBe("A");
  });

  it("has no current week before week 1", () => {
    const view = buildOffseasonView({ ...data([]), weeks: [], teams: [], members: [], games: [] }, []);
    expect(view.currentWeek).toBeNull();
    expect(view.ratings.size).toBe(0);
  });
});
