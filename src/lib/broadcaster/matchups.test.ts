import { describe, expect, it } from "vitest";
import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { ScoutSource } from "@/lib/scouting/types";
import { deriveBroadcasterMatchups } from "./matchups";

const fixture = (id: string, season = "S5") => ({
  id,
  season,
  stage: "week_1" as const,
  team_a: "Alpha",
  team_b: "Beta",
  scheduled_at: `2026-08-${id.padStart(2, "0")}T00:00:00Z`,
  best_of: 3 as const,
  score_a: 0,
  score_b: 0,
});

const draft = (id: string, fixtureId: string, teamName: string, playerName: string, champion: string) => ({
  id,
  fixture_id: fixtureId,
  game_number: 1,
  blue_team_name: teamName,
  red_team_name: "Opponent",
  winner_team: null,
  actions: LCS_DRAFT_STEPS.map((step) => ({
    stepIndex: step.index,
    side: step.side,
    kind: step.kind,
    slot: step.slot,
    champion: step.kind === "pick" && step.side === "blue" && step.slot === 1 ? champion : null,
    playerName: step.kind === "pick" && step.side === "blue" && step.slot === 1 ? playerName : null,
  })),
  positions: null,
  created_at: "2026-08-01T00:00:00Z",
});

const teamA: ScoutSource = {
  opponentName: "Alpha",
  teamName: "Alpha",
  currentSeason: "S5",
  nextFixture: fixture("99"),
  roster: [
    { id: "alpha-sub", displayName: "Alpha Sub", role: "mid" },
    { id: "alpha-mid", displayName: "Alpha Mid", role: "mid" },
  ],
  fixtures: [fixture("01")],
  drafts: [
    draft("alpha-mid", "01", "Alpha", "Alpha Mid", "Orianna"),
    draft("alpha-sub", "01", "Alpha", "Alpha Sub", "LeBlanc"),
  ],
};

const teamB: ScoutSource = {
  opponentName: "Beta",
  teamName: "Beta",
  currentSeason: "S5",
  nextFixture: fixture("99"),
  roster: [{ id: "beta-mid", displayName: "Beta Mid", role: "mid" }],
  fixtures: [fixture("02"), fixture("03", "S4")],
  drafts: [
    draft("beta-one", "02", "Beta", "Beta Mid", "Ahri"),
    draft("beta-two", "02", "Beta", "Beta Mid", "Ahri"),
    draft("beta-old", "03", "Beta", "Beta Mid", "Zed"),
  ],
  inhousePlayerStats: [{
    playerId: "beta-mid",
    playerName: "Beta Mid",
    role: "mid",
    games: 3,
    champions: [],
  }],
};

describe("deriveBroadcasterMatchups", () => {
  it("derives alphabetized role matchups with scoped pools and in-house stats", () => {
    const rows = deriveBroadcasterMatchups(teamA, teamB, "season");

    expect(rows.map((row) => row.role)).toEqual(["top", "jungle", "mid", "adc", "support"]);
    expect(rows.find((row) => row.role === "mid")?.teamAPlayers.map((player) => player.name))
      .toEqual(["Alpha Mid", "Alpha Sub"]);
    expect(rows.find((row) => row.role === "mid")?.teamBPlayers[0]).toMatchObject({
      name: "Beta Mid",
      champions: [{ champion: "Ahri", count: 2 }],
      totalPicks: 2,
      distinctChampions: 1,
      inhouse: { playerId: "beta-mid", games: 3 },
    });
    expect(rows.find((row) => row.role === "support")?.teamBPlayers).toEqual([]);
  });

  it("includes prior-season player picks only in the all scope", () => {
    const season = deriveBroadcasterMatchups(teamA, teamB, "season");
    const all = deriveBroadcasterMatchups(teamA, teamB, "all");

    expect(season.find((row) => row.role === "mid")?.teamBPlayers[0].champions)
      .toEqual([{ champion: "Ahri", count: 2 }]);
    expect(all.find((row) => row.role === "mid")?.teamBPlayers[0].champions)
      .toEqual([{ champion: "Ahri", count: 2 }, { champion: "Zed", count: 1 }]);
  });
});
