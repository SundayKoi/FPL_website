import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { BroadcasterPlayerDetails } from "@/lib/broadcaster/types";
import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import type { ScoutSource } from "@/lib/scouting/types";
import BroadcasterMatchups from "./BroadcasterMatchups";

vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card }: { card: PlayerCardData }) => (
    <div data-testid={`premium-card-${card.slug}`}>premium card: {card.name}</div>
  ),
}));

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
  inhousePlayerStats: [{
    playerId: "alpha-top",
    playerName: "Alpha Top",
    role: "top",
    games: 0,
    champions: [],
  }],
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

const card = (slug: string, name: string): PlayerCardData => ({ slug, name } as PlayerCardData);

const playerDetails: BroadcasterPlayerDetails[] = [
  {
    playerId: "alpha-top",
    card: card("alpha-top-card", "Alpha Top"),
    averages: { games: 4, kda: 2.5, damagePerMin: 600, visionPerMin: 1.2, turretsPerGame: 0.75, goldPerMin: 400, multiKills: 3 },
  },
  {
    playerId: "alpha-jungle",
    card: card("alpha-jungle-card", "Alpha Jungle"),
    averages: { games: 4, kda: 3.25, damagePerMin: 500, visionPerMin: 0.8, turretsPerGame: 0.25, goldPerMin: 350, multiKills: 2 },
  },
  {
    playerId: "alpha-support",
    card: card("alpha-support-card", "Alpha Support"),
    averages: { games: 4, kda: 1.5, damagePerMin: 200, visionPerMin: 1.5, turretsPerGame: 0, goldPerMin: 300, multiKills: 1 },
  },
];

describe("BroadcasterMatchups", () => {
  it("renders every role with roster gaps, player pools, and in-house champion stats", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} />);

    expect(screen.getAllByRole("heading", { level: 2 }).map((heading) => heading.textContent))
      .toEqual(["Top", "Jungle", "Mid", "ADC", "Support"]);
    expect(screen.getByText("Alpha Sub")).toBeTruthy();
    expect(screen.getByText("2 picks · 1 champion · 2 games")).toBeTruthy();
    expect(screen.getByText("3 in-house games")).toBeTruthy();
    expect(screen.getAllByText("No rostered player")).toHaveLength(1);
  });

  it("renders an explicit role label on every player card", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} />);

    const betaMidCard = screen.getByText("Beta Mid").closest("article");
    expect(betaMidCard).toBeTruthy();
    expect(within(betaMidCard!).getByText("Mid")).toBeTruthy();
  });

  it("renders a no-games state for an in-house row with zero games", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} />);

    expect(screen.getByText("No in-house games found")).toBeTruthy();
  });

  it("renders the per-champion in-house sample count", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} />);

    expect(screen.getByText("×2 · 50% WR · 3.17 KDA")).toBeTruthy();
  });

  it("renders premium cards and role-specific average stats", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} playerDetails={playerDetails} />);

    const topCard = screen.getByText("Alpha Top").closest("article");
    expect(within(topCard!).getByTestId("premium-card-alpha-top-card")).toBeTruthy();
    expect(within(topCard!).getByText("KDA")).toBeTruthy();
    expect(within(topCard!).getByText("2.50")).toBeTruthy();
    expect(within(topCard!).getByText("DMG/min")).toBeTruthy();
    expect(within(topCard!).getByText("600")).toBeTruthy();
    expect(within(topCard!).getByText("Turrets/game")).toBeTruthy();
    expect(within(topCard!).getByText("0.75")).toBeTruthy();
    expect(within(topCard!).getByText("Gold/min")).toBeTruthy();
    expect(within(topCard!).getByText("Multi-kills")).toBeTruthy();
    expect(within(topCard!).queryByText("Vision/min")).toBeNull();

    const jungleCard = screen.getByText("Alpha Jungle").closest("article");
    expect(within(jungleCard!).getByText("Vision/min")).toBeTruthy();

    const supportCard = screen.getByText("Alpha Support").closest("article");
    expect(within(supportCard!).getByTestId("premium-card-alpha-support-card")).toBeTruthy();
    expect(within(supportCard!).getByText("Vision/min")).toBeTruthy();
    expect(within(supportCard!).queryByText("Gold/min")).toBeNull();
    expect(within(supportCard!).queryByText("Multi-kills")).toBeNull();
  });

  it("collapses in-house stats by default and toggles them open", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} />);

    const details = screen.getByText("3 in-house games").closest("details");
    expect(details).toBeTruthy();
    expect(details?.hasAttribute("open")).toBe(false);

    fireEvent.click(screen.getByText("3 in-house games"));
    expect(details?.hasAttribute("open")).toBe(true);

    fireEvent.click(screen.getByText("3 in-house games"));
    expect(details?.hasAttribute("open")).toBe(false);
  });

  it("includes prior-season picks when matchup history changes to all history", () => {
    render(<BroadcasterMatchups teamA={teamA} teamB={teamB} />);

    expect(screen.queryByText("2 picks · 2 champions · 2 games")).toBeNull();
    fireEvent.change(screen.getByLabelText("Matchup history"), { target: { value: "all" } });
    expect(screen.getByText("2 picks · 2 champions · 2 games")).toBeTruthy();
  });
});
