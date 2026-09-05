import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StatsTabs from "./StatsTabs";

const { fetchSeasons, fetchPlayerAgg } = vi.hoisted(() => ({
  fetchSeasons: vi.fn(),
  fetchPlayerAgg: vi.fn(),
}));

vi.mock("@/lib/stats/queries", () => ({ fetchSeasons, fetchPlayerAgg }));
vi.mock("./SeasonSelect", () => ({
  ALL_SEASONS: "All",
  default: ({ season, phase, onSeasonChange, onPhaseChange }: {
    season: string;
    phase: string;
    onSeasonChange: (value: string) => void;
    onPhaseChange: (value: "Regular") => void;
  }) => (
    <div>
      <select aria-label="Season" value={season} onChange={(event) => onSeasonChange(event.target.value)}>
        <option value="All">All</option>
        <option value="S4">S4</option>
        <option value="S5">S5</option>
      </select>
      <button type="button" onClick={() => onPhaseChange("Regular")}>{phase}</button>
    </div>
  ),
}));
vi.mock("./TeamsTab", () => ({
  default: ({ selectedTeamName, onSelectTeam }: { selectedTeamName: string | null; onSelectTeam: (value: string | null) => void }) => selectedTeamName ? (
    <div>
      <h2>{selectedTeamName}</h2>
      <button type="button" aria-label="Back to teams" onClick={() => onSelectTeam(null)}>Back to teams</button>
    </div>
  ) : (
    <button type="button" aria-label="Meridian team stats" onClick={() => onSelectTeam("Meridian")}>Meridian</button>
  ),
}));
vi.mock("./LeaderboardTab", () => ({
  default: ({ onSelectPlayer }: { onSelectPlayer: (value: { summonerName: string; tag: string }) => void }) => <button type="button" onClick={() => onSelectPlayer({ summonerName: "Player", tag: "TAG" })}>Choose player</button>,
}));
vi.mock("./PlayerDetail", () => ({ default: ({ onBack }: { onBack: () => void }) => <button type="button" onClick={onBack}>Player detail</button> }));
vi.mock("./FantasyPointsTab", () => ({ default: () => <div>Fantasy points</div> }));
vi.mock("./ChampionsTab", () => ({ default: () => <div>Champions</div> }));
vi.mock("./RecordsTab", () => ({ default: () => <div>Records</div> }));
vi.mock("./HeadToHeadTab", () => ({ default: () => <div>Head to head</div> }));
vi.mock("./TimelineTab", () => ({ default: () => <div>Timeline</div> }));
vi.mock("./PlayersTab", () => ({ default: () => <div>Players</div> }));

function setPath(path: string) {
  window.history.replaceState(null, "", path);
}

function params() {
  return new URL(window.location.href).searchParams;
}

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

beforeEach(() => {
  setPath("/stats");
  fetchSeasons.mockResolvedValue(["S5", "S4"]);
  fetchPlayerAgg.mockResolvedValue([]);
});

describe("StatsTabs team URL state", () => {
  it("defaults an initial team link to the Teams tab", async () => {
    render(<StatsTabs initialTeam="Meridian" initialSeason="S5" />);
    await waitFor(() => expect(screen.getByRole("heading", { name: "Meridian" })).toBeTruthy());
    expect(screen.getByRole("button", { name: "Teams", pressed: true })).toBeTruthy();
  });

  it("keeps team, tab, season, and phase in a shareable URL", async () => {
    render(<StatsTabs initialTab="Teams" initialSeason="S4" initialPhase="Regular" />);
    fireEvent.click(await screen.findByRole("button", { name: /Meridian team stats/i }));
    await waitFor(() => expect(params().get("team")).toBe("Meridian"));
    expect(params().get("tab")).toBe("Teams");
    expect(params().get("season")).toBe("S4");
    expect(params().get("phase")).toBe("Regular");
  });

  it("clears team when another tab is selected", async () => {
    render(<StatsTabs initialTeam="Meridian" initialSeason="S4" />);
    await screen.findByRole("heading", { name: "Meridian" });
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    await waitFor(() => expect(params().get("team")).toBeNull());
  });

  it("Back clears only team and retains the Teams scope", async () => {
    render(<StatsTabs initialTab="Teams" initialTeam="Meridian" initialSeason="S4" initialPhase="Regular" />);
    fireEvent.click(await screen.findByRole("button", { name: /back to teams/i }));
    await waitFor(() => expect(params().get("team")).toBeNull());
    expect(params().get("tab")).toBe("Teams");
    expect(params().get("season")).toBe("S4");
    expect(params().get("phase")).toBe("Regular");
  });

  it("clears team when a player is selected", async () => {
    render(<StatsTabs initialTab="Teams" initialTeam="Meridian" initialSeason="S4" />);
    await screen.findByRole("heading", { name: "Meridian" });
    fireEvent.click(screen.getByRole("button", { name: "Leaderboard" }));
    fireEvent.click(await screen.findByRole("button", { name: "Choose player" }));
    await waitFor(() => expect(params().get("team")).toBeNull());
    expect(params().get("player")).toBe("Player#TAG");
  });

  it("preserves the Academy stats root", async () => {
    setPath("/academy/stats");
    render(<StatsTabs initialTab="Teams" initialSeason="S4" />);
    fireEvent.click(await screen.findByRole("button", { name: /Meridian team stats/i }));
    await waitFor(() => expect(window.location.pathname).toBe("/academy/stats"));
    expect(params().get("team")).toBe("Meridian");
  });
});
