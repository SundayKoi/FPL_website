import { cleanup, render, screen } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminPage from "./page";

const { redirect, fetchStaffTier, fetchHomepageSchedule, fetchHomepageFeaturedSettings, fetchAcademyDraftData, fetchLeagueSeasons } = vi.hoisted(() => ({
  redirect: vi.fn(),
  fetchStaffTier: vi.fn(),
  fetchHomepageSchedule: vi.fn(),
  fetchHomepageFeaturedSettings: vi.fn(),
  fetchAcademyDraftData: vi.fn(),
  fetchLeagueSeasons: vi.fn(),
}));

vi.mock("next/navigation", () => ({
  redirect,
  usePathname: () => "/admin",
  useRouter: () => ({ push: vi.fn(), replace: vi.fn() }),
  useSearchParams: () => new URLSearchParams(),
}));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/home/schedule", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/home/schedule")>()),
  fetchHomepageSchedule,
}));
vi.mock("@/lib/home/homepageSettings", () => ({ fetchHomepageFeaturedSettings }));
vi.mock("@/lib/academy/draft", () => ({ fetchAcademyDraftData }));
vi.mock("@/lib/league/season", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/league/season")>()),
  fetchLeagueSeasons,
}));

function chain(result: unknown) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    in: vi.fn(() => query),
    single: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

function defaultFrom(table: string) {
  if (table === "league_settings") {
    return chain({ data: { current_season: "S5", current_phase: "week_1", signups_open: true, homepage_mode: "auto" }, error: null });
  }
  if (table === "fixtures") return chain({ data: [{ season: "S5" }, { season: "A1" }], error: null });
  if (table === "match_reports" || table === "card_claims" || table === "player_identity_links") {
    return chain({ data: [], count: 0, error: null });
  }
  return chain({ data: [], error: null });
}

const supabase = { from: vi.fn(defaultFrom) };
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => supabase) }));

const fixture = (id: string, teamA: string, teamB: string | null): FixtureRow => ({
  id,
  season: "S5",
  stage: "week_1",
  division: "Solari",
  team_a: teamA,
  team_b: teamB,
  scheduled_at: "2026-08-17T19:00:00Z",
  best_of: 3,
  score_a: null,
  score_b: null,
  sort_order: 1,
  created_at: "2026-08-01T00:00:00Z",
});

beforeEach(() => {
  cleanup();
  vi.clearAllMocks();
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
  fetchHomepageSchedule.mockResolvedValue({
    season: "S5",
    upcoming: [fixture("premier-fixture", "Premier A", "Premier B")],
    activeStage: "week_1",
  });
  fetchHomepageFeaturedSettings.mockResolvedValue({ fixtureId: "premier-fixture", title: "Spotlight", description: "Copy", twitchUrl: null });
  fetchAcademyDraftData.mockResolvedValue({ teams: [{ name: "Academy A" }, { name: "Academy B" }] });
  fetchLeagueSeasons.mockResolvedValue({ premier: "S5", academy: "A1" });
  supabase.from.mockImplementation(defaultFrom);
});

describe("AdminPage", () => {
  it("shows the concise overview and links editors to dedicated workspaces", async () => {
    render(await AdminPage());

    expect(screen.getByRole("heading", { name: "League operations" })).not.toBeNull();
    expect(screen.getByRole("link", { name: /edit featured matchup/i }).getAttribute("href")).toBe("/admin/content");
    expect(screen.getByRole("link", { name: /view schedule/i }).getAttribute("href")).toContain("/admin/league/schedule?league=premier&season=S5");
    expect(screen.queryByTestId("premier-featured-editor")).toBeNull();
  });

  it("keeps the season selection inside the requested league", async () => {
    render(await AdminPage({ searchParams: Promise.resolve({ league: "premier", season: "A1" }) }));

    expect((screen.getByRole("combobox", { name: "Season" }) as HTMLSelectElement).value).toBe("S5");
  });

  it("keeps Premier filtering separate from Academy even when team names overlap", async () => {
    render(await AdminPage());

    const scope = fetchHomepageSchedule.mock.calls[0][0] as (fixtures: { season: string; id: string }[]) => { id: string }[];
    expect(scope([
      { season: "S5", id: "premier" },
      { season: "A1", id: "academy" },
    ]).map((row) => row.id)).toEqual(["premier"]);
  });

  it("keeps owner-only draft access available to an owner without admin access", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });

    render(await AdminPage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("link", { name: /open draft room/i }).getAttribute("href")).toBe("/admin/league/drafts");
    expect(screen.getByText("Review queues are available to admins.")).not.toBeNull();
  });

  it("keeps broadcasters limited to the broadcast workspace", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: true });

    render(await AdminPage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "League operations" })).not.toBeNull();
    expect(screen.getByRole("heading", { name: "Homepage controls" })).not.toBeNull();
    expect(screen.queryByRole("region", { name: "League status" })).toBeNull();
    expect(screen.queryByRole("link", { name: /open draft room/i })).toBeNull();
  });

  it("redirects visitors without staff access", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    redirect.mockImplementation(() => { throw new Error("redirected"); });

    await expect(AdminPage()).rejects.toThrow("redirected");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(fetchHomepageSchedule).not.toHaveBeenCalled();
  });
});
