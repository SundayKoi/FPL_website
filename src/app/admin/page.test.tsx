import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminPage from "./page";

const { redirect, fetchStaffTier, editor, fetchHomepageSchedule, fetchHomepageFeaturedSettings, fetchAcademyDraftData, fetchLeagueSeasons } = vi.hoisted(() => ({
  redirect: vi.fn(),
  fetchStaffTier: vi.fn(),
  editor: vi.fn(({ homepage, fixtures, settings }) => (
    <div data-testid={`${homepage}-featured-editor`}>
      {settings.title ?? "Default copy"} · {fixtures.map((fixture: { id: string }) => fixture.id).join(",")}
    </div>
  )),
  fetchHomepageSchedule: vi.fn(),
  fetchHomepageFeaturedSettings: vi.fn(),
  fetchAcademyDraftData: vi.fn(),
  fetchLeagueSeasons: vi.fn(),
}));

vi.mock("next/navigation", () => ({ redirect }));
vi.mock("@/lib/auth/staffTier", () => ({ fetchStaffTier }));
vi.mock("@/lib/home/schedule", () => ({ fetchHomepageSchedule }));
vi.mock("@/lib/home/homepageSettings", () => ({ fetchHomepageFeaturedSettings }));
vi.mock("@/lib/academy/draft", () => ({ fetchAcademyDraftData }));
vi.mock("@/lib/league/season", () => ({ fetchLeagueSeasons }));
vi.mock("@/components/admin/AdminFeaturedMatchupEditor", () => ({ default: editor }));
vi.mock("@/components/admin/DraftListClient", () => ({ default: () => <div /> }));
vi.mock("@/components/admin/AdminHomepageMode", () => ({ default: () => <div /> }));
vi.mock("@/components/admin/AdminStaff", () => ({ default: () => <div /> }));
// Renders a browser Supabase client at mount — mocked like every other
// admin child so the page test needs no NEXT_PUBLIC_SUPABASE_* env.
vi.mock("@/components/admin/AdminBangerTitles", () => ({ default: () => <div /> }));

const fixture = (id: string, teamA: string, teamB: string): FixtureRow => ({
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

function chain(result: unknown) {
  const query = {
    select: vi.fn(() => query),
    order: vi.fn(() => query),
    eq: vi.fn(() => query),
    single: vi.fn().mockResolvedValue(result),
    limit: vi.fn().mockResolvedValue(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

const supabase = {
  from: vi.fn((table: string) => {
    if (table === "league_settings") {
      return chain({ data: { current_season: "S5", current_phase: "week_1", signups_open: true, homepage_mode: "auto" } });
    }
    if (table === "signups") return chain({ count: 3 });
    if (table === "fixtures") return chain({ count: 8 });
    if (table === "homepage_briefs") return chain({ data: [] });
    return chain({ data: [] });
  }),
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => supabase),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false });
  fetchHomepageSchedule.mockResolvedValue({ fixtures: [fixture("premier-fixture", "Premier A", "Premier B")] });
  fetchHomepageFeaturedSettings.mockImplementation(async (homepage: string) =>
    homepage === "premier"
      ? { fixtureId: "premier-fixture", title: "Premier spotlight", description: "Premier copy" }
      : { fixtureId: "academy-fixture", title: "Academy spotlight", description: "Academy copy" },
  );
  fetchAcademyDraftData.mockResolvedValue({ teams: [{ name: "Academy A" }, { name: "Academy B" }] });
  fetchLeagueSeasons.mockResolvedValue({ premier: "S5", academy: "A1" });
});

afterEach(() => cleanup());

describe("AdminPage", () => {
  it("does not render the removed homepage write-up section", async () => {
    render(await AdminPage());

    expect(screen.queryByRole("region", { name: "Homepage write-up" })).toBeNull();
  });

  it("shows Premier and Academy featured editors to staff with their scoped settings and fixtures", async () => {
    fetchHomepageSchedule
      .mockResolvedValueOnce({ fixtures: [fixture("premier-fixture", "Premier A", "Premier B")] })
      .mockResolvedValueOnce({ fixtures: [fixture("academy-fixture", "Academy A", "Academy B")] });

    render(await AdminPage());

    expect(screen.getByTestId("premier-featured-editor").textContent).toContain("Premier spotlight · premier-fixture");
    expect(screen.getByTestId("academy-featured-editor").textContent).toContain("Academy spotlight · academy-fixture");
    expect(fetchHomepageFeaturedSettings).toHaveBeenCalledWith("premier");
    expect(fetchHomepageFeaturedSettings).toHaveBeenCalledWith("academy");
  });

  it("uses the same unfiltered Premier schedule scope as the homepage", async () => {
    render(await AdminPage());

    expect(fetchHomepageSchedule).toHaveBeenNthCalledWith(1);
  });

  it("allows an owner who is not an admin to access the admin page", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true });

    render(await AdminPage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("premier-featured-editor")).not.toBeNull();
    expect(screen.getByTestId("academy-featured-editor")).not.toBeNull();
  });

  it("keeps the existing redirect for a non-staff visitor", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false });
    redirect.mockImplementation(() => {
      throw new Error("redirected");
    });

    await expect(AdminPage()).rejects.toThrow("redirected");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(editor).not.toHaveBeenCalled();
  });
});
