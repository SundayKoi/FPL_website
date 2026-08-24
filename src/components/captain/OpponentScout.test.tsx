import { cleanup, fireEvent, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import { LCS_DRAFT_STEPS } from "@/lib/match-draft/rules";
import { championIconUrl } from "@/lib/match-draft/champions";
import type { MatchDraftAction } from "@/lib/match-draft/types";
import type { ScoutSource } from "@/lib/scouting/types";
import OpponentScout from "./OpponentScout";

afterEach(cleanup);

const actions = (): MatchDraftAction[] => LCS_DRAFT_STEPS.map((step) => ({
  stepIndex: step.index, side: step.side, kind: step.kind, slot: step.slot,
  champion: step.kind === "pick" ? (step.side === "blue" ? ["Ahri", "Vi", "Nautilus", "Garen", "Orianna"][step.slot - 1] : ["Zed", "Lee Sin", "Jinx", "Leona", "Malphite"][step.slot - 1]) : (step.side === "blue" ? "Lux" : "Rumble"),
  skipped: false,
}));
const fixture = (id: string, season = "S5") => ({ id, season, stage: "week_1" as const, team_a: "Night Vale", team_b: "Other", scheduled_at: `2026-08-0${id}T00:00:00Z`, best_of: 3 as const, score_a: 1, score_b: 0 });
const source: ScoutSource = {
  opponentName: "Night Vale", currentSeason: "S5", nextFixture: fixture("9"), roster: [
    { id: "1", displayName: "Northstar", role: "mid" }, { id: "2", displayName: "LowTide", role: "support" },
  ], fixtures: [fixture("1"), fixture("2"), fixture("3", "S4")], drafts: [
    { id: "d1", fixture_id: "1", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other", winner_team: "Night Vale", actions: actions(), positions: null, created_at: "2026-08-01" },
    { id: "d2", fixture_id: "2", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other", winner_team: "Other", actions: actions(), positions: null, created_at: "2026-08-02" },
    { id: "d3", fixture_id: "3", game_number: 1, blue_team_name: "Night Vale", red_team_name: "Other", winner_team: null, actions: actions(), positions: null, created_at: "2026-08-03" },
  ],
};

function renderScout(overrides: Partial<ScoutSource> = {}) { return render(<OpponentScout source={{ ...source, ...overrides }} />); }

describe("OpponentScout", () => {
  it("renders the Scouting page and changes sampled scope", () => {
    renderScout();
    expect(screen.getByText("Premium · Scouting")).toBeTruthy();
    expect(screen.getByText("Opponent")).toBeTruthy();
    expect(screen.getAllByText("Night Vale").length).toBeGreaterThan(0);
    expect(screen.getAllByText(/0 picks · 0 champions · 0 games/).length).toBeGreaterThan(0);
    expect(screen.getByRole("heading", { name: "Scouting" })).toBeTruthy();
    const playerPools = screen.getByRole("heading", { name: "Player pools" }).closest("section");
    const patterns = screen.getByRole("heading", { name: "Draft patterns" }).closest("section");
    expect(playerPools?.compareDocumentPosition(patterns!)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    expect(playerPools?.querySelector("ul")?.className).not.toContain("md:grid-cols-2");
    expect((screen.getByLabelText("Draft history") as HTMLSelectElement).value).toBe("season");
    expect(screen.getByText("Drafts sampled").parentElement?.textContent).toContain("2");
    fireEvent.change(screen.getByLabelText("Draft history"), { target: { value: "all" } });
    expect(screen.getByText("Drafts sampled").parentElement?.textContent).toContain("3");
    expect(screen.queryByText(/recommend|must ban|priority|threat score/i)).toBeNull();
  });
  it("uses neutral team wording when requested", () => {
    render(<OpponentScout source={source} perspective="team" />);
    expect(screen.getByText("Team")).toBeTruthy();
    expect(screen.queryByText("Opponent")).toBeNull();
  });
  it("uses neutral empty-history wording for a team", () => {
    render(<OpponentScout source={{ ...source, drafts: [] }} perspective="team" />);
    expect(screen.getByText("No recorded drafts for this team yet")).toBeTruthy();
  });
  it("handles no drafts and unavailable current roster independently", () => {
    renderScout({ drafts: [], roster: [] });
    expect(screen.getByText("No recorded drafts for this opponent yet")).toBeTruthy();
    expect(screen.queryByText("Current roster unavailable")).toBeNull();
  });
  it("keeps valid draft history visible when the current roster is empty", () => {
    renderScout({ roster: [] });
    expect(screen.getByText("Past drafts")).toBeTruthy();
    expect(screen.getAllByText(/Scouted team: Blue side/).length).toBeGreaterThan(0);
    expect(screen.getByText("Current roster unavailable")).toBeTruthy();
    fireEvent.change(screen.getByLabelText("Draft history"), { target: { value: "all" } });
    expect(screen.getAllByText("All history").length).toBeGreaterThan(0);
  });
  it("uses champion icons and complete blue/red draft slots", () => {
    renderScout();
    const patterns = screen.getByRole("heading", { name: "Draft patterns" }).parentElement;
    expect(within(patterns!).getByText("Bans against")).toBeTruthy();
    expect(within(patterns!).queryByText("Ban phase 1 · first 3")).toBeNull();
    expect(within(patterns!).queryByText("Ban phase 2 · last 2")).toBeNull();
    const image = document.querySelector("img") as HTMLImageElement;
    expect(image.getAttribute("src")).toBe(championIconUrl("Ahri"));
    expect(screen.getAllByText("Ahri").length).toBeGreaterThan(0);
    for (const champion of ["Ahri", "Vi", "Nautilus", "Garen", "Orianna", "Zed", "Lee Sin", "Jinx", "Leona", "Malphite"]) {
      expect(screen.getAllByText(champion).some((node) => node.parentElement?.querySelector("img")?.getAttribute("src") === championIconUrl(champion))).toBe(true);
    }
    const details = screen.getAllByRole("group").find((el) => el.tagName === "DETAILS");
    expect(details).toBeTruthy();
    fireEvent.click(within(details!).getByText(/Game 1/));
    expect(within(details!).getByText("Blue side")).toBeTruthy();
    expect(within(details!).getByText("Red side")).toBeTruthy();
    expect(within(details!).getAllByText("Ban phase 1 · first 3")).toHaveLength(2);
    expect(within(details!).getAllByText("Ban phase 2 · last 2")).toHaveLength(2);
    expect(within(details!).getAllByTestId("blue-pick-slot")).toHaveLength(5);
    expect(within(details!).getAllByTestId("red-pick-slot")).toHaveLength(5);
  });
  it("groups games under one scheduled series heading", () => {
    const grouped = structuredClone(source);
    grouped.drafts.push({ ...grouped.drafts[0], id: "d1-game2", game_number: 2 });
    renderScout(grouped);
    expect(screen.getAllByRole("heading", { name: /Night Vale vs Other/ })).toHaveLength(2);
    expect(screen.getAllByText(/Sat, Aug 1/).length).toBe(1);
    expect(screen.getByText("Game 2")).toBeTruthy();
  });
  it("shows skipped pick labels in a complete draft", () => {
    const skipped = structuredClone(source);
    skipped.drafts[0].actions = skipped.drafts[0].actions.map((action) => action.stepIndex === 7 ? { ...action, champion: null, skipped: true } : action);
    renderScout(skipped);
    const details = screen.getAllByRole("group").find((el) => el.tagName === "DETAILS");
    fireEvent.click(within(details!).getByText(/Game 1/));
    expect(screen.getAllByText("R1").length).toBeGreaterThan(0);
  });
  it("keeps player pool chips neutral", () => {
    renderScout();
    const tokens = screen.getAllByText("Ahri").map((el) => el.parentElement).filter(Boolean);
    expect(tokens.some((token) => token?.className.match(/blue|purple|green/))).toBe(false);
  });
  it("switches to in-house champion stats and hides regular scouting sections", () => {
    renderScout({ inhousePlayerStats: [{
      playerId: "1", playerName: "Northstar", role: "mid", games: 2,
      champions: [{ champion: "Ahri", games: 2, wins: 1, winrate_pct: 50, avg_kda: 3.17 }],
    }] });
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.getByRole("heading", { name: "In-house champion stats" })).toBeTruthy();
    expect(screen.getByText("Northstar")).toBeTruthy();
    expect(screen.getByText("Ahri")).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Draft patterns" })).toBeNull();
    expect(screen.queryByLabelText("Draft history")).toBeNull();
  });
});
