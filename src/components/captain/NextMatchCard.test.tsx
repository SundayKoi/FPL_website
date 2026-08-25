import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import NextMatchCard from "./NextMatchCard";

afterEach(cleanup);

const fixture: FixtureRow = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1",
  division: null,
  team_a: "My Team",
  team_b: "Enemy Team",
  scheduled_at: null,
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-16T00:00:00Z",
};

describe("NextMatchCard", () => {
  it("links the opponent OP.GG multi-search when one is available", () => {
    render(
      <NextMatchCard
        fixture={fixture}
        myTeamName="My Team"
        opponentMultiOpggUrl="https://op.gg/lol/multisearch/na?summoners=Enemy%23NA1"
      />,
    );

    const link = screen.getByRole("link", { name: "Opponent OP.GG Multi" });
    expect(link.getAttribute("href")).toBe("https://op.gg/lol/multisearch/na?summoners=Enemy%23NA1");
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("omits the opponent OP.GG link when no URL is available", () => {
    render(<NextMatchCard fixture={fixture} myTeamName="My Team" />);

    expect(screen.queryByRole("link", { name: "Opponent OP.GG Multi" })).toBeNull();
  });

  it("offers one spectator-first Watch Draft link for the whole series", () => {
    render(<NextMatchCard fixture={fixture} myTeamName="My Team" />);

    expect(screen.getByText(/series drafter/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /watch draft/i }).getAttribute("href")).toBe(
      "/match-draft/fixture-1",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("shows per-game draft status chips, skipping untouched draft rows", () => {
    render(
      <NextMatchCard
        fixture={fixture}
        myTeamName="My Team"
        draftGames={[
          { gameNumber: 1, status: "complete", started: true, blueTeamId: null, winnerTeamId: null },
          { gameNumber: 2, status: "drafting", started: true, blueTeamId: null, winnerTeamId: null },
          // A lone ready check creates a row with no actions — no chip.
          { gameNumber: 3, status: "drafting", started: false, blueTeamId: null, winnerTeamId: null },
        ]}
      />,
    );

    expect(screen.getByText(/G1 drafted/)).toBeTruthy();
    expect(screen.getByText(/G2 drafting/)).toBeTruthy();
    expect(screen.queryByText(/G3/)).toBeNull();
  });
});
