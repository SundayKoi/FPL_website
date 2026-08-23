import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import HomeStandings from "./HomeStandings";
import type { HomeStandingTeam } from "@/lib/home/standings";

function team(name: string, nomination_position: number, division?: string | null): HomeStandingTeam {
  return {
    id: name.toLowerCase(),
    name,
    abbreviation: name.slice(0, 2).toUpperCase(),
    nomination_position,
    division,
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

  it("numbers rows by standings position, not by draft nomination slot", () => {
    // The list arrives pre-sorted by record; Alcatraz drafted 12th but sits
    // first, so their row must read #1.
    render(
      <HomeStandings
        teams={[
          { ...team("Alcatraz", 12), wins: 9, losses: 1, winrate_pct: 90 },
          { ...team("Bravo", 1), wins: 2, losses: 8, winrate_pct: 20 },
        ]}
      />,
    );

    expect(screen.getByText("#1")).toBeTruthy();
    expect(screen.getByText("#2")).toBeTruthy();
    expect(screen.queryByText("#12")).toBeNull();
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

  it("splits standings into division sections when teams have divisions", () => {
    render(
      <HomeStandings
        teams={[
          { ...team("Lunari One", 1, "Lunari"), wins: 2, losses: 0, winrate_pct: 100 },
          { ...team("Solari One", 2, "Solari"), wins: 1, losses: 1, winrate_pct: 50 },
          { ...team("Lunari Two", 3, "Lunari"), wins: 0, losses: 2, winrate_pct: 0 },
        ]}
      />,
    );

    const lunari = screen.getByRole("group", { name: /lunari division/i });
    const solari = screen.getByRole("group", { name: /solari division/i });

    expect(lunari.textContent).toContain("Lunari One");
    expect(lunari.textContent).toContain("Lunari Two");
    expect(lunari.textContent).not.toContain("Solari One");
    expect(solari.textContent).toContain("Solari One");
  });
});
