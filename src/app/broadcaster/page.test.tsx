import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { HomepageFeaturedSettings } from "@/lib/home/homepageSettings";
import type { FixtureRow } from "@/lib/schedule/types";
import type { ScoutSource } from "@/lib/scouting/types";

const {
  createServerSupabase,
  fetchStaffTier,
  redirect,
  resolveBroadcasterFixture,
  loadBroadcasterScouting,
} = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
  fetchStaffTier: vi.fn(),
  redirect: vi.fn(() => {
    throw new Error("redirected");
  }),
  resolveBroadcasterFixture: vi.fn(),
  loadBroadcasterScouting: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));
vi.mock("@/lib/auth/staffTier", async (importOriginal) => {
  const original = await importOriginal<typeof import("@/lib/auth/staffTier")>();
  return { ...original, fetchStaffTier };
});
vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/broadcaster/workspace", () => ({
  resolveBroadcasterFixture,
  loadBroadcasterScouting,
}));
vi.mock("@/components/broadcaster/BroadcasterWorkspace", () => ({
  default: ({
    league,
    fixture,
    teamA,
    teamB,
  }: {
    league: string;
    fixture: FixtureRow;
    teamA: ScoutSource;
    teamB: ScoutSource;
  }) => (
    <section>
      Workspace: {league} · {fixture.team_a} vs {fixture.team_b} · {teamA.teamName} · {teamB.teamName}
    </section>
  ),
}));

import BroadcasterPage from "./page";

const supabase = { auth: {}, from: vi.fn() };

const fixture: FixtureRow = {
  id: "fixture-1",
  season: "S5",
  stage: "week_1",
  division: "Solari",
  team_a: "Alpha",
  team_b: "Beta",
  scheduled_at: "2026-08-24T00:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 0,
  created_at: "2026-08-19T00:00:00Z",
};

const settings: HomepageFeaturedSettings = {
  fixtureId: fixture.id,
  title: null,
  description: null,
  twitchUrl: "https://twitch.tv/fpl",
};

function source(teamName: string): ScoutSource {
  return {
    opponentName: teamName,
    teamName,
    currentSeason: "S5",
    nextFixture: fixture,
    roster: [],
    fixtures: [],
    drafts: [],
  };
}

const semifinal = (id: string, teamA: string | null, teamB: string | null): FixtureRow => ({
  ...fixture,
  id,
  stage: "semifinals",
  division: null,
  team_a: teamA,
  team_b: teamB,
  best_of: 5,
  sort_order: id === "semi-1" ? 0 : 1,
});

function context(overrides: Partial<{ fixture: FixtureRow | null; upcoming: FixtureRow[] }> = {}) {
  return {
    league: "premier" as const,
    season: "S5",
    teams: [],
    fixture,
    upcoming: [fixture],
    settings,
    ...overrides,
  };
}

beforeEach(() => {
  createServerSupabase.mockResolvedValue(supabase);
  fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: true });
  resolveBroadcasterFixture.mockResolvedValue(context());
  loadBroadcasterScouting.mockResolvedValue({ teamA: source("Alpha"), teamB: source("Beta") });
});

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

describe("Broadcaster page", () => {
  it.each([
    ["broadcaster", { isAdmin: false, isOwner: false, isBroadcaster: true }, false],
    ["owner", { isAdmin: false, isOwner: true, isBroadcaster: false }, false],
    ["admin only", { isAdmin: true, isOwner: false, isBroadcaster: false }, true],
    ["ordinary user", { isAdmin: false, isOwner: false, isBroadcaster: false }, true],
    ["signed-out visitor", { isAdmin: false, isOwner: false, isBroadcaster: false }, true],
  ])("applies the broadcaster access rule for a %s", async (_label, tier, redirected) => {
    fetchStaffTier.mockResolvedValue(tier);

    if (redirected) {
      await expect(BroadcasterPage({ searchParams: Promise.resolve({}) })).rejects.toThrow("redirected");
      expect(resolveBroadcasterFixture).not.toHaveBeenCalled();
    } else {
      render(await BroadcasterPage({ searchParams: Promise.resolve({}) }));
      expect(screen.getByText(/Workspace: premier/)).toBeTruthy();
    }
  });

  it("uses the requested Academy league for fixture resolution", async () => {
    const academyContext = { ...context(), league: "academy" as const };
    resolveBroadcasterFixture.mockResolvedValue(academyContext);

    render(await BroadcasterPage({ searchParams: Promise.resolve({ league: "academy" }) }));

    expect(resolveBroadcasterFixture).toHaveBeenCalledWith(supabase, "academy", null);
    expect(screen.getByText(/Workspace: academy/)).toBeTruthy();
  });

  it("renders an Academy empty state with a way to choose the featured matchup", async () => {
    resolveBroadcasterFixture.mockResolvedValue({ ...context({ fixture: null }), league: "academy" });

    render(await BroadcasterPage({ searchParams: Promise.resolve({ league: "academy" }) }));

    expect(screen.getByText("No Academy featured match is available.")).toBeTruthy();
    expect(screen.getByRole("link", { name: /choose the featured matchup/i }).getAttribute("href"))
      .toBe("/admin");
    expect(loadBroadcasterScouting).not.toHaveBeenCalled();
  });

  it("preserves fixture tools when the scouting query throws", async () => {
    const error = new Error("scouting unavailable");
    const consoleError = vi.spyOn(console, "error").mockImplementation(() => undefined);
    loadBroadcasterScouting.mockRejectedValue(error);

    render(await BroadcasterPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: /Alpha.*Beta/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /open draft/i }).getAttribute("href"))
      .toBe("/match-draft/fixture-1?overlay=1&bg=transparent");
    expect(screen.getByText("Scouting data is temporarily unavailable.")).toBeTruthy();
    expect(consoleError).toHaveBeenCalledWith("Unable to load broadcaster scouting", error);
    consoleError.mockRestore();
  });

  it("lists the night's games as pills, grouped by stage, with the shown game current", async () => {
    const night = [fixture, semifinal("semi-1", "Gamma", "Delta"), semifinal("semi-2", "Echo", null)];
    resolveBroadcasterFixture.mockResolvedValue(context({ fixture: night[1], upcoming: night }));

    render(await BroadcasterPage({ searchParams: Promise.resolve({ fixture: "semi-1" }) }));

    expect(resolveBroadcasterFixture).toHaveBeenCalledWith(supabase, "premier", "semi-1");
    const games = screen.getByRole("navigation", { name: /tonight's games/i });
    expect(games.textContent).toContain("Week 1");
    expect(games.textContent).toContain("Semifinals");
    expect(screen.getByRole("link", { name: "Alpha vs Beta" }).getAttribute("href"))
      .toBe("/broadcaster?league=premier&fixture=fixture-1");
    const selected = screen.getByRole("link", { name: "Gamma vs Delta" });
    expect(selected.getAttribute("href")).toBe("/broadcaster?league=premier&fixture=semi-1");
    expect(selected.getAttribute("aria-current")).toBe("page");
    expect(screen.getByRole("link", { name: /^featured$/i }).getAttribute("href"))
      .toBe("/broadcaster?league=premier");
    // Nothing to scout in a bracket slot that has not been filled yet.
    const tbd = screen.getByText("Echo vs TBD");
    expect(tbd.getAttribute("aria-disabled")).toBe("true");
    expect(tbd.tagName).toBe("SPAN");
  });

  it("renders no game pills when the night has a single fixture", async () => {
    render(await BroadcasterPage({ searchParams: Promise.resolve({}) }));

    expect(screen.queryByRole("navigation", { name: /tonight's games/i })).toBeNull();
  });

  it("preserves fixture tools when unresolved team names produce no scouting data", async () => {
    const unresolvedFixture = { ...fixture, team_b: null };
    resolveBroadcasterFixture.mockResolvedValue(context({ fixture: unresolvedFixture }));
    loadBroadcasterScouting.mockResolvedValue(null);

    render(await BroadcasterPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByRole("heading", { name: /Alpha.*TBD/i })).toBeTruthy();
    expect(screen.getByRole("link", { name: /open draft/i }).getAttribute("href"))
      .toBe("/match-draft/fixture-1?overlay=1&bg=transparent");
    expect(screen.getByText("Scouting data is temporarily unavailable.")).toBeTruthy();
  });
});
