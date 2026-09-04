import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import type { TeamAggRow } from "@/lib/stats/types";
import TeamStatsRadar from "./TeamStatsRadar";

function row(overrides: Partial<TeamAggRow> = {}): TeamAggRow {
  return {
    team_name: "Meridian",
    season: "S5",
    season_phase: "All",
    games: 8,
    wins: 5,
    losses: 3,
    winrate_pct: 62.5,
    avg_duration_min: 31.5,
    dragon_rate: 48,
    baron_rate: 110,
    first_blood_rate: -4,
    first_tower_rate: Number.NaN,
    avg_team_kills: 12.5,
    ...overrides,
  };
}

describe("TeamStatsRadar", () => {
  it("renders five accessible percentage metrics and keeps SVG supplementary", () => {
    const { container } = render(<TeamStatsRadar row={row({ first_tower_rate: 40 })} />);
    expect(container.querySelector("svg")?.getAttribute("aria-hidden")).toBe("true");
    expect(screen.getByRole("term", { name: "Win rate" })).toBeTruthy();
    expect(screen.getByRole("term", { name: "Dragon control" })).toBeTruthy();
    expect(screen.getByRole("term", { name: "Baron control" })).toBeTruthy();
    expect(screen.getByRole("term", { name: "First blood" })).toBeTruthy();
    expect(screen.getByRole("term", { name: "First tower" })).toBeTruthy();
    expect(screen.getByText("100.0%")).toBeTruthy();
    expect(screen.getByText("0.0%")).toBeTruthy();
    expect(container.textContent).not.toContain("NaN");
    expect(screen.getByText(/12\.5 kills\/game/i)).toBeTruthy();
    expect(screen.getByText(/31\.5 min average/i)).toBeTruthy();
  });
});
