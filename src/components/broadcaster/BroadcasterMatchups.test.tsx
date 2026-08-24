import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { ScoutSource } from "@/lib/scouting/types";
import BroadcasterMatchups from "./BroadcasterMatchups";

afterEach(cleanup);

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
    { id: "alpha-top", displayName: "Alpha Top", role: "top" },
    { id: "alpha-jungle", displayName: "Alpha Jungle", role: "jungle" },
    { id: "alpha-mid", displayName: "Alpha Mid", role: "mid" },
    { id: "alpha-sub", displayName: "Alpha Sub", role: "mid" },
    { id: "alpha-adc", displayName: "Alpha ADC", role: "adc" },
    { id: "alpha-support", displayName: "Alpha Support", role: "support" },
  ],
  fixtures: [fixture("01"), fixture("02")],
  drafts: [
    draft("alpha-sub-one", "01", "Alpha", "Alpha Sub", "LeBlanc"),
    draft("alpha-sub-two", "02", "Alpha", "Alpha Sub", "LeBlanc"),
  ],
};

const teamB: ScoutSource = {
  opponentName: "Beta",
  teamName: "Beta",
  currentSeason: "S5",
  nextFixture: fixture("99"),
  roster: [
    { id: "beta-top", displayName: "Beta Top", role: "top" },
    { id: "beta-jungle", displayName: "Beta Jungle", role: "jungle" },
    { id: "beta-mid", displayName: "Beta Mid", role: "mid" },
    { id: "beta-adc", displayName: "Beta ADC", role: "adc" },
  ],
  fixtures: [fixture("03"), fixture("04", "S4")],
  drafts: [
    draft("beta-current-one", "03", "Beta", "Beta Mid", "Ahri"),
    draft("beta-prior", "04", "Beta", "Beta Mid", "Zed"),
  ],
  inhousePlayerStats: [{
    playerId: "beta-mid",
    playerName: "Beta Mid",
    role: "mid",
    games: 3,
    champions: [{ champion: "Ahri", games: 2, wins: 1, winrate_pct: 50, avg_kda: 3.17 }],
  }],
};

describe("BroadcasterMatchups", () => {
  it("renders every role with roster gaps, player pools, and in-house champion stats", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} />);

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent))
      .toEqual(["Top", "Jungle", "Mid", "ADC", "Support"]);
    expect(screen.getByText("Alpha Sub")).toBeTruthy();
    expect(screen.getByText("2 picks · 1 champion · 2 games")).toBeTruthy();
    expect(screen.getByText("3 in-house games")).toBeTruthy();
    expect(screen.getByText("50% WR · 3.17 KDA")).toBeTruthy();
    expect(screen.getAllByText("No rostered player")).toHaveLength(1);
  });

  it("includes prior-season picks when matchup history changes to all history", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} />);

    expect(screen.queryByText("2 picks · 2 champions · 2 games")).toBeNull();
    fireEvent.change(screen.getByLabelText("Matchup history"), { target: { value: "all" } });
    expect(screen.getByText("2 picks · 2 champions · 2 games")).toBeTruthy();
  });
});
