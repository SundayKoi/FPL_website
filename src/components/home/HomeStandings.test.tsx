import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomeStandings from "./HomeStandings";
import type { HomeStandingTeam } from "@/lib/home/standings";

function team(name: string, nomination_position: number): HomeStandingTeam {
  return {
    id: name.toLowerCase(),
    name,
    abbreviation: name.slice(0, 2).toUpperCase(),
    nomination_position,
    wins: 0,
    losses: 0,
  };
}

afterEach(() => {
  cleanup();
});

describe("HomeStandings", () => {
  it("renders every featured team with an initial 0–0 record", () => {
    render(<HomeStandings teams={[team("Alpha", 1), team("Bravo", 2)]} />);

    expect(screen.getByRole("article", { name: /team standings/i })).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();
    expect(screen.getAllByText("0–0")).toHaveLength(2);
  });

  it("renders a no-data state without placeholder teams", () => {
    render(<HomeStandings teams={[]} />);

    expect(screen.getByText(/standings will appear once/i)).toBeTruthy();
    expect(screen.queryByText("Alpha")).toBeNull();
  });

  it("labels derived standings with the season and shows the win rate", () => {
    render(<HomeStandings teams={[{ ...team("Alpha", 1), wins: 8, losses: 2, winrate_pct: 80 }]} />);

    expect(screen.getByText(/s5 standings/i)).toBeTruthy();
    expect(screen.getByText("80%")).toBeTruthy();
  });

  it("labels the Academy season rather than Premier's", () => {
    render(
      <HomeStandings
        seasonLabel="A1"
        teams={[{ ...team("Alpha", 1), wins: 8, losses: 2, winrate_pct: 80 }]}
      />,
    );

    expect(screen.getByText(/a1 standings/i)).toBeTruthy();
  });
});
