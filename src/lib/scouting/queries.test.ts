import { describe, expect, it, vi } from "vitest";
import { fetchScoutingHistory } from "./queries";
import type { SupabaseClient } from "@supabase/supabase-js";

const fixture = (id: string, teamA: string | null, teamB: string | null) => ({
  id, season: "S5", stage: "week_1", team_a: teamA, team_b: teamB,
  scheduled_at: "2026-08-01T00:00:00Z", best_of: 3, score_a: 2, score_b: 1,
});

function builder(data: unknown, error: unknown = null) {
  const query = {
    select: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(resolve({ data, error })),
  };
  return query;
}

describe("fetchScoutingHistory", () => {
  it("loads compact active-league rows and maps nullable draft JSON safely", async () => {
    const rawActions = [{ stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" }];
    const fixtureQuery = builder([
      fixture("premier-fixture", "Night Vale", "Other"),
      fixture("cross-league", "Night Vale", "Academy Wolves"),
    ]);
    const draftQuery = builder([
      { id: "draft-1", fixture_id: "premier-fixture", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other", winner_team: null, actions: rawActions, positions: null, created_at: "2026-08-01" },
      { id: "draft-cross", fixture_id: "cross-league", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Academy Wolves", winner_team: null, actions: null, positions: null, created_at: "2026-08-01" },
    ]);
    const from = vi.fn((table: string) => table === "fixtures" ? fixtureQuery : draftQuery);
    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, {
      league: "premier", leagueTeamNames: [" night vale ", "Other"],
    });

    expect(from).toHaveBeenCalledWith("fixtures");
    expect(from).toHaveBeenCalledWith("match_drafts");
    expect(fixtureQuery.select).toHaveBeenCalledWith("id, season, stage, team_a, team_b, scheduled_at, best_of, score_a, score_b");
    expect(draftQuery.select).toHaveBeenCalledWith("id, fixture_id, game_number, blue_team_name, red_team_name, winner_team, actions, positions, created_at");
    expect(history.fixtures.map((row) => row.id)).toEqual(["premier-fixture"]);
    expect(history.drafts[0].actions).toEqual(rawActions);
    expect(history.drafts).toHaveLength(1);
    expect(history.drafts[0].positions).toBeNull();
  });

  it("uses Academy's one-team boundary and throws either PostgREST error", async () => {
    const rows = [fixture("academy", "Academy Wolves", "Premier Lions"), fixture("none", "Premier Lions", "Other")];
    const from = vi.fn((table: string) => table === "fixtures" ? builder(rows) : builder([]));
    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, { league: "academy", leagueTeamNames: new Set(["academy wolves"]) });
    expect(history.fixtures.map((row) => row.id)).toEqual(["academy"]);

    const fixtureError = new Error("fixture failed");
    await expect(fetchScoutingHistory({ from: vi.fn((table: string) => table === "fixtures" ? builder([], fixtureError) : builder([])) } as unknown as SupabaseClient, { league: "premier", leagueTeamNames: [] })).rejects.toThrow("fixture failed");
    const draftError = new Error("draft failed");
    await expect(fetchScoutingHistory({ from: vi.fn((table: string) => table === "fixtures" ? builder([], null) : builder([], draftError)) } as unknown as SupabaseClient, { league: "premier", leagueTeamNames: [] })).rejects.toThrow("draft failed");
  });

  it("drops malformed nested actions and normalizes invalid position sides", async () => {
    const fixtureQuery = builder([fixture("f", "Night Vale", "Other")]);
    const draftQuery = builder([{
      id: "d", fixture_id: "f", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other",
      winner_team: null,
      actions: [
        { stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" },
        null, "not an action", { kind: "pick", champion: 42 }, { kind: "unknown", champion: "Lux" },
        { stepIndex: "bad", kind: "pick", champion: "Lux" },
      ],
      positions: { blue: ["Ahri", null], red: ["bad", 42] },
      created_at: "2026-08-01",
    }]);
    const from = vi.fn((table: string) => table === "fixtures" ? fixtureQuery : draftQuery);
    const history = await fetchScoutingHistory({ from } as unknown as SupabaseClient, { league: "premier", leagueTeamNames: ["Night Vale", "Other"] });
    expect(history.drafts[0].actions).toEqual([{ stepIndex: 0, kind: "ban", side: "blue", champion: "Ahri" }]);
    expect(history.drafts[0].positions).toEqual({ blue: ["Ahri", null] });
  });
});
