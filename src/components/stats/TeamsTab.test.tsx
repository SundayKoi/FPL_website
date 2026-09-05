import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { TeamAggRow } from "@/lib/stats/types";
import TeamsTab from "./TeamsTab";

const { fetchTeamAgg, fetchForfeitRecords } = vi.hoisted(() => ({
  fetchTeamAgg: vi.fn(),
  fetchForfeitRecords: vi.fn(),
}));

vi.mock("@/lib/stats/queries", () => ({ fetchTeamAgg, fetchForfeitRecords }));

function row(overrides: Partial<TeamAggRow> = {}): TeamAggRow {
  return {
    team_name: "Meridian",
    season: "S5",
    season_phase: "Regular",
    games: 4,
    wins: 3,
    losses: 1,
    winrate_pct: 75,
    avg_duration_min: 30,
    dragon_rate: 50,
    baron_rate: 25,
    first_blood_rate: 75,
    first_tower_rate: 50,
    avg_team_kills: 12,
    ...overrides,
  };
}

function renderControlled(initial: string | null = null) {
  function Wrapper() {
    const [selected, setSelected] = React.useState(initial);
    return <TeamsTab season="S5" phase="All" selectedTeamName={selected} onSelectTeam={setSelected} />;
  }
  return render(<Wrapper />);
}

import * as React from "react";

afterEach(() => {
  cleanup();
  fetchTeamAgg.mockReset();
  fetchForfeitRecords.mockReset();
});

describe("TeamsTab", () => {
  it("preserves ranking order and makes every team card keyboard-selectable", async () => {
    fetchTeamAgg.mockResolvedValue([row({ team_name: "Lower", wins: 1, losses: 3, winrate_pct: 25 }), row({ team_name: "Upper", wins: 4, losses: 0, winrate_pct: 100 })]);
    fetchForfeitRecords.mockResolvedValue([]);
    renderControlled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Upper team stats/i })).toBeTruthy());
    const cards = screen.getAllByRole("button", { name: /team stats/i });
    expect(cards.map((card) => card.textContent)).toEqual(expect.arrayContaining([expect.stringContaining("Upper"), expect.stringContaining("Lower")]));
    expect(cards[0].textContent).toContain("Upper");
  });

  it("canonicalizes an initial selected team and opens its detail", async () => {
    fetchTeamAgg.mockResolvedValue([row()]);
    fetchForfeitRecords.mockResolvedValue([]);
    renderControlled(" meridian ");
    await waitFor(() => expect(screen.getByRole("heading", { name: "Meridian" })).toBeTruthy());
    expect(screen.getByText(/Team detail/i)).toBeTruthy();
    expect(screen.getByRole("button", { name: /back to teams/i })).toBeTruthy();
  });

  it("merges phase rows before display and returns from detail to the grid", async () => {
    fetchTeamAgg.mockResolvedValue([
      row({ games: 2, wins: 2, losses: 0, winrate_pct: 100 }),
      row({ season_phase: "Playoffs", games: 6, wins: 3, losses: 3, winrate_pct: 50 }),
    ]);
    fetchForfeitRecords.mockResolvedValue([]);
    renderControlled();
    await waitFor(() => expect(screen.getByRole("button", { name: /Meridian team stats/i })).toBeTruthy());
    fireEvent.click(screen.getByRole("button", { name: /Meridian team stats/i }));
    expect(screen.getByRole("heading", { name: "Meridian" })).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: /back to teams/i }));
    expect(screen.getByRole("button", { name: /Meridian team stats/i })).toBeTruthy();
  });

  it("shows an explicit no-row detail", async () => {
    fetchTeamAgg.mockResolvedValue([]);
    fetchForfeitRecords.mockResolvedValue([]);
    renderControlled("Missing Team");
    await waitFor(() => expect(screen.getByText(/No team stats for this season\/phase yet/i)).toBeTruthy());
  });

  it("keeps the existing error state when the aggregate fetch fails", async () => {
    fetchTeamAgg.mockRejectedValue(new Error("network"));
    fetchForfeitRecords.mockResolvedValue([]);
    renderControlled();
    await waitFor(() => expect(screen.getByText(/Couldn't load team data/i)).toBeTruthy());
  });
});
