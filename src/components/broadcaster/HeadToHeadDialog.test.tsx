import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { BroadcasterMatchupPlayer, BroadcasterRoleMatchup } from "@/lib/broadcaster/matchups";
import type { ScoutSource } from "@/lib/scouting/types";
import HeadToHeadDialog from "./HeadToHeadDialog";

vi.mock("@/components/cards/PlayerCard3D", () => ({
  default: ({ card }: { card: PlayerCardData }) => (
    <div data-testid={`spotlight-card-${card.slug}`}>player card: {card.name}</div>
  ),
}));

afterEach(cleanup);

const card = (slug: string, name: string): PlayerCardData => ({ slug, name } as PlayerCardData);

const player = (id: string, name: string, role: BroadcasterMatchupPlayer["role"], withCard = true): BroadcasterMatchupPlayer => ({
  id,
  name,
  role,
  champions: [{ champion: "Ahri", count: 3 }],
  totalPicks: 3,
  distinctChampions: 1,
  gamesSampled: 3,
  inhouse: null,
  card: withCard ? card(`${id}-card`, name) : null,
  averages: {
    games: 4,
    kda: 3.25,
    damagePerMin: 600,
    visionPerMin: 1.1,
    turretsPerGame: 0.5,
    goldPerMin: 410,
    multiKills: 2,
  },
  gameRecord: { games: 4, wins: 3, losses: 1, winratePct: 75 },
});

const recordFixture = {
  id: "record-1",
  season: "S5",
  stage: "week_1" as const,
  team_a: "Alpha",
  team_b: "Beta",
  scheduled_at: "2026-08-01T00:00:00Z",
  best_of: 3 as const,
  score_a: 2,
  score_b: 1,
};

const matchups: BroadcasterRoleMatchup[] = [
  { role: "top", label: "Top", teamAPlayers: [player("alpha-top", "Alpha Top", "top")], teamBPlayers: [player("beta-top", "Beta Top", "top")] },
  { role: "jungle", label: "Jungle", teamAPlayers: [player("alpha-jungle", "Alpha Jungle", "jungle")], teamBPlayers: [player("beta-jungle", "Beta Jungle", "jungle")] },
  { role: "mid", label: "Mid", teamAPlayers: [player("alpha-mid", "Alpha Mid", "mid")], teamBPlayers: [player("beta-mid", "Beta Mid", "mid")] },
  { role: "adc", label: "ADC", teamAPlayers: [player("alpha-adc", "Alpha ADC", "adc")], teamBPlayers: [player("beta-adc", "Beta ADC", "adc")] },
  { role: "support", label: "Support", teamAPlayers: [player("alpha-support", "Alpha Support", "support")], teamBPlayers: [player("beta-support", "Beta Support", "support")] },
];

const teamA: ScoutSource = {
  opponentName: "Alpha",
  teamName: "Alpha",
  teamImageUrl: "https://img.test/alpha.png",
  currentSeason: "S5",
  nextFixture: {} as ScoutSource["nextFixture"],
  roster: matchups.flatMap((matchup) => matchup.teamAPlayers.map((rosterPlayer) => ({
    id: rosterPlayer.id,
    displayName: rosterPlayer.name,
    role: rosterPlayer.role,
  }))),
  fixtures: [recordFixture],
  drafts: [],
};

const teamB: ScoutSource = {
  ...teamA,
  opponentName: "Beta",
  teamName: "Beta",
  teamImageUrl: "https://img.test/beta.png",
  roster: matchups.flatMap((matchup) => matchup.teamBPlayers.map((rosterPlayer) => ({
    id: rosterPlayer.id,
    displayName: rosterPlayer.name,
    role: rosterPlayer.role,
  }))),
};

describe("HeadToHeadDialog", () => {
  it("opens on team overview, then navigates through all five role matchups", () => {
    render(
      <HeadToHeadDialog
        open
        onClose={vi.fn()}
        teamA={teamA}
        teamB={teamB}
        matchups={matchups}
      />,
    );

    expect(screen.getByRole("dialog", { name: /head-to-head/i })).toBeTruthy();
    expect(screen.getByRole("heading", { name: /matchup overview/i })).toBeTruthy();
    expect(screen.getAllByAltText(/team logo/i)).toHaveLength(2);
    expect(screen.getAllByText("1–0")).toHaveLength(1);
    expect(screen.getAllByText("0–1")).toHaveLength(1);
    expect(screen.getAllByText("Individual game win rate")).toHaveLength(2);
    expect(screen.queryByText("Cards ready")).toBeNull();
    expect(screen.queryByText("Battle plan")).toBeNull();
    const sectionNav = within(screen.getByRole("navigation", { name: /head-to-head sections/i }));
    expect(sectionNav.getAllByRole("button", { name: /^(overview|top|jungle|mid|adc|support)$/i })).toHaveLength(6);

    const next = screen.getByRole("button", { name: /next matchup/i });
    fireEvent.click(next);

    const topPanel = screen.getByRole("heading", { name: /top lane/i }).closest("section");
    expect(topPanel).toBeTruthy();
    expect(within(topPanel!).getByTestId("spotlight-card-alpha-top-card")).toBeTruthy();
    expect(within(topPanel!).getByTestId("spotlight-card-beta-top-card")).toBeTruthy();
    expect(within(topPanel!).getAllByText("3.25")).toHaveLength(2);

    for (const label of ["Jungle", "Mid", "ADC", "Support"]) {
      fireEvent.click(screen.getByRole("button", { name: new RegExp(`^${label}$`, "i") }));
      expect(screen.getByRole("heading", { name: new RegExp(`${label} lane`, "i") })).toBeTruthy();
    }

    expect(screen.getByRole("button", { name: /next matchup/i })).toHaveProperty("disabled", true);
    expect(screen.getByRole("button", { name: /previous matchup/i })).toHaveProperty("disabled", false);
  });

  it("closes through Escape, backdrop, and close button", () => {
    const onClose = vi.fn();
    const { rerender } = render(
      <HeadToHeadDialog
        open
        onClose={onClose}
        teamA={teamA}
        teamB={teamB}
        matchups={matchups}
      />,
    );

    fireEvent.keyDown(window, { key: "Escape" });
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <HeadToHeadDialog
        open
        onClose={onClose}
        teamA={teamA}
        teamB={teamB}
        matchups={matchups}
      />,
    );
    fireEvent.click(screen.getByRole("button", { name: /close head-to-head/i }));
    fireEvent.click(screen.getByRole("dialog"));
    expect(onClose).toHaveBeenCalledTimes(3);
  });
});
