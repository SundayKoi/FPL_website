import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import MyTeamGate from "./MyTeamGate";
import type { MyTeamDashboardResult } from "@/lib/my-team/types";

const fixture = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1" as const,
  division: null,
  team_a: "My Team",
  team_b: "Enemy Team",
  scheduled_at: null,
  best_of: 3 as const,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-01T00:00:00Z",
};

const ready: MyTeamDashboardResult = {
  kind: "ready",
  league: "premier",
  profileId: "profile-1",
  playerPoolId: "pool-1",
  season: "S5",
  team: {
    id: "team-1",
    name: "My Team",
    abbreviation: "MY",
    active: true,
    imageUrl: "https://img.test/my-team.png",
    bannerColor: "#123456",
  },
  teams: [
    { id: "team-1", name: "My Team", abbreviation: "MY", active: true },
    { id: "team-2", name: "Enemy Team", abbreviation: "EN", active: true },
  ],
  activeTeams: [
    { id: "team-1", name: "My Team", abbreviation: "MY", active: true },
    { id: "team-2", name: "Enemy Team", abbreviation: "EN", active: true },
  ],
  nextFixture: fixture,
  codes: [{
    id: "code-1",
    fixture_id: fixture.id,
    season: "S5",
    team_a_id: "team-1",
    team_b_id: "team-2",
    game_number: 1,
    code: "TOURNEY-CODE",
    note: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
  }, {
    id: "code-2",
    fixture_id: fixture.id,
    season: "S5",
    team_a_id: "team-1",
    team_b_id: "team-2",
    game_number: 2,
    code: "TOURNEY-CODE-2",
    note: null,
    created_by: null,
    created_at: "2026-08-01T00:00:00Z",
  }],
  draftGames: [],
  schedule: [fixture],
  roster: {
    draftPlayers: [{
      id: "draft-player-1",
      draft_id: "draft-1",
      display_name: "Signed In Player",
      role: "mid",
      rank: null,
      opgg_url: null,
      notes: null,
      canonical_player_id: "pool-1",
      team_id: "draft-team-1",
      price: 10,
      acquisition: "auction",
    }],
    riotAccounts: [],
    multiOpggUrl: null,
  },
  opponent: {
    team: { id: "team-2", name: "Enemy Team", abbreviation: "EN", active: true },
    name: "Enemy Team",
    roster: { draftPlayers: [], riotAccounts: [] },
    multiOpggUrl: null,
    scoutingUnavailable: false,
  },
  results: { games: [], players: [] },
  isCaptain: false,
  isAdmin: false,
};

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: { writeText: vi.fn().mockResolvedValue(undefined) },
  });
});

afterEach(cleanup);

describe("MyTeamGate", () => {
  it("offers a signed-out visitor a safe return-to-page sign in", () => {
    render(<MyTeamGate dashboard={{ kind: "signed-out", season: "S5" }} league="premier" />);

    expect(screen.getByText(/sign in to see your team/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /sign in/i }).getAttribute("href"))
      .toBe("/login?redirect=/my-team");
  });

  it("guides an unlinked player to the public team pages", () => {
    render(<MyTeamGate dashboard={{
      kind: "unlinked",
      season: "S5",
      availableTeams: [
        { id: "academy-team-1", name: "Academy One", abbreviation: "A1", active: true },
        { id: "academy-team-2", name: "Academy Two", abbreviation: "A2", active: true },
      ],
    }} league="academy" />);

    expect(screen.getByText(/claim your roster spot/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /academy one/i }).getAttribute("href"))
      .toBe("/academy/teams/academy-one");
    expect(screen.getByRole("link", { name: /academy two/i }).getAttribute("href"))
      .toBe("/academy/teams/academy-two");
    expect(screen.getByRole("link", { name: /browse academy teams/i }).getAttribute("href"))
      .toBe("/academy/teams");
  });

  it("explains pending approval and gives the claimant a withdrawal path", () => {
    render(<MyTeamGate dashboard={{
      kind: "pending",
      season: "S5",
      linkId: "link-1",
      playerPoolId: "pool-1",
      leagueTeamId: "team-1",
    }} league="premier" />);

    expect(screen.getByText(/captain or league admin can approve/i)).toBeTruthy();
    expect(screen.getByRole("link", { name: /review or withdraw/i }).getAttribute("href")).toBe("/teams");
  });

  it("explains an approved player who is not on an active roster", () => {
    render(<MyTeamGate dashboard={{
      kind: "unrostered",
      season: "S5",
      playerPoolId: "pool-1",
    }} league="premier" />);

    expect(screen.getByText(/identity is linked/i)).toBeTruthy();
    expect(screen.getByRole("heading", { name: /no active team/i })).toBeTruthy();
  });

  it("renders the complete ordinary-player dashboard with spectator-safe actions only", async () => {
    render(<MyTeamGate dashboard={ready} league="premier" />);

    const teamHeading = screen.getByRole("heading", { name: "My Team" });
    const teamHeader = teamHeading.closest("header");
    expect(teamHeader?.getAttribute("style")).toContain("border-top-color: rgb(18, 52, 86)");
    expect(screen.getByRole("img", { name: "My Team logo" }).getAttribute("src"))
      .toBe("https://img.test/my-team.png");
    const accentFades = Array.from(document.querySelectorAll("[data-team-accent-fade]"));
    expect(accentFades).toHaveLength(6);
    expect(accentFades.every((fade) => fade.getAttribute("style")?.includes("linear-gradient"))).toBe(true);
    expect(screen.getAllByText("vs Enemy Team")).toHaveLength(2);
    expect(screen.getByRole("link", { name: /captain.*link/i }).getAttribute("href"))
      .toBe("/match-draft/fixture-1?layout=board");
    expect(screen.getByRole("link", { name: /spectator link/i }).getAttribute("href"))
      .toBe("/match-draft/fixture-1?layout=stage");
    expect(screen.getByRole("link", { name: /scout opponent/i }).getAttribute("href"))
      .toBe("/my-team/scouting");

    const panels = [
      screen.getByRole("heading", { name: /tourney codes/i }).closest("details"),
      screen.getByRole("heading", { name: /team schedule/i }).closest("details"),
      screen.getByRole("heading", { name: /my roster/i }).closest("details"),
      screen.getByRole("heading", { name: /my results & stats/i }).closest("details"),
    ];
    panels.forEach((panel) => expect(panel?.hasAttribute("open")).toBe(false));

    const codesPanel = panels[0]!;
    fireEvent.click(within(codesPanel).getByRole("heading", { name: /tourney codes/i }));
    expect(codesPanel.hasAttribute("open")).toBe(true);
    expect(screen.getByText("TOURNEY-CODE")).toBeTruthy();

    fireEvent.click(within(codesPanel).getByRole("button", { name: "Copy all" }));
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("TOURNEY-CODE\nTOURNEY-CODE-2"));

    const rosterRow = screen.getByText("Signed In Player").closest("li")!;
    expect(within(rosterRow).getByText("You")).toBeTruthy();

    fireEvent.click(within(codesPanel).getAllByRole("button", { name: "Copy" })[0]);
    await waitFor(() => expect(navigator.clipboard.writeText).toHaveBeenCalledWith("TOURNEY-CODE"));

    expect(screen.queryByText(/report a result/i)).toBeNull();
    expect(screen.queryByRole("heading", { name: /league admin/i })).toBeNull();
    expect(screen.queryByRole("button", { name: /ready|ban|pick|reset|record/i })).toBeNull();
  });
});
