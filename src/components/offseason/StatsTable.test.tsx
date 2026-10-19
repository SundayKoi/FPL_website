import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { PlayerStats, StatLine } from "@/lib/offseason/stats";
import StatsTable from "./StatsTable";

afterEach(cleanup);

function line(overrides: Partial<StatLine>): StatLine {
  return { games: 3, wins: 0, losses: 0, kills: 5, deaths: 3, assists: 7, kda: 4, csPerMin: 7, damagePerMin: 600, visionPerMin: 1, killParticipation: 60, champions: ["Ahri"], ...overrides };
}

const players: PlayerStats[] = [
  { entrantId: "a", name: "Ace", role: "mid", team: null, overall: 80, wins: 2, losses: 1, line: line({ kda: 3.5, deaths: 4 }) },
  { entrantId: "b", name: "Brick", role: "top", team: null, overall: 85, wins: 1, losses: 2, line: line({ kda: 6.25, deaths: 1.5 }) },
  { entrantId: "c", name: "Comet", role: "mid", team: null, overall: 80, wins: 3, losses: 0, line: line({ kda: 5, deaths: 2 }) },
];

const order = () => within(screen.getAllByRole("rowgroup")[1]).getAllByRole("link").map((link) => link.textContent);

describe("StatsTable", () => {
  it("ranks by Overall, ties by record, then sorts by any column", () => {
    render(<StatsTable players={players} showTeam={false} />);
    expect(order()).toEqual(["Brick", "Comet", "Ace"]);
    fireEvent.click(screen.getByRole("button", { name: "KDA" }));
    expect(order()).toEqual(["Brick", "Comet", "Ace"]);
    fireEvent.click(screen.getByRole("button", { name: /KDA/ }));
    expect(order()).toEqual(["Ace", "Comet", "Brick"]);
    // Deaths start lowest first.
    fireEvent.click(screen.getByRole("button", { name: "D" }));
    expect(order()).toEqual(["Brick", "Comet", "Ace"]);
    expect(screen.getByRole("columnheader", { name: "D ↑" }).getAttribute("aria-sort")).toBe("ascending");
  });

  it("filters by role", () => {
    render(<StatsTable players={players} showTeam={false} />);
    fireEvent.click(screen.getByRole("button", { name: "Mid" }));
    expect(order()).toEqual(["Comet", "Ace"]);
    fireEvent.click(screen.getByRole("button", { name: "Jungle" }));
    expect(screen.getByText("No Jungle players with games yet.")).toBeTruthy();
  });
});
