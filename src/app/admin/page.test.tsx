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
vi.mock("@/lib/auth/staffTier", () => ({
  fetchStaffTier,
  isMissingBroadcasterColumn: (error: { code?: string; message?: string } | null) =>
    (error?.code === "PGRST204" || error?.code === "42703") && error.message?.includes("is_broadcaster"),
}));
vi.mock("@/lib/home/schedule", () => ({ fetchHomepageSchedule }));
vi.mock("@/lib/home/homepageSettings", () => ({ fetchHomepageFeaturedSettings }));
vi.mock("@/lib/academy/draft", () => ({ fetchAcademyDraftData }));
vi.mock("@/lib/league/season", () => ({ fetchLeagueSeasons }));
vi.mock("@/components/admin/AdminFeaturedMatchupEditor", () => ({ default: editor }));
vi.mock("@/components/admin/DraftListClient", () => ({ default: () => <div /> }));
vi.mock("@/components/admin/AdminHomepageMode", () => ({ default: () => <div /> }));
vi.mock("@/components/admin/AdminStaff", () => ({ default: ({ profiles }: { profiles: { display_name: string }[] }) => <div data-testid="admin-staff">{profiles.map((profile) => profile.display_name).join(",")}</div> }));
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

function defaultFrom(table: string) {
    if (table === "league_settings") {
      return chain({ data: { current_season: "S5", current_phase: "week_1", signups_open: true, homepage_mode: "auto" } });
    }
    if (table === "signups") return chain({ count: 3 });
    if (table === "fixtures") return chain({ count: 8 });
    if (table === "homepage_briefs") return chain({ data: [] });
    return chain({ data: [] });
}

const supabase = {
  from: vi.fn(defaultFrom),
};

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => supabase),
}));

beforeEach(() => {
  vi.clearAllMocks();
  fetchStaffTier.mockResolvedValue({ isAdmin: true, isOwner: false, isBroadcaster: false });
  fetchHomepageSchedule.mockResolvedValue({ fixtures: [fixture("premier-fixture", "Premier A", "Premier B")] });
  fetchHomepageFeaturedSettings.mockImplementation(async (homepage: string) =>
    homepage === "premier"
      ? { fixtureId: "premier-fixture", title: "Premier spotlight", description: "Premier copy", twitchUrl: null }
      : { fixtureId: "academy-fixture", title: "Academy spotlight", description: "Academy copy", twitchUrl: null },
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
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });

    render(await AdminPage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByTestId("premier-featured-editor")).not.toBeNull();
    expect(screen.getByTestId("academy-featured-editor")).not.toBeNull();
  });

  it("keeps the owner staff list visible while the broadcaster migration is pending", async () => {
    let profileQuery = 0;
    supabase.from.mockImplementation((table: string) => {
      if (table === "profiles") {
        profileQuery += 1;
        return profileQuery === 1
          ? chain({ data: null, error: { code: "PGRST204", message: "Column is_broadcaster not found" } })
          : chain({ data: [{ id: "owner-1", display_name: "Owner One", is_admin: true, is_owner: true }], error: null });
      }
      return defaultFrom(table);
    });
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: true, isBroadcaster: false });

    render(await AdminPage());

    expect(screen.getByTestId("admin-staff").textContent).toBe("Owner One");
  });

  it("shows broadcasters the admin header and homepage controls only", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: true });

    render(await AdminPage());

    expect(redirect).not.toHaveBeenCalled();
    expect(screen.getByRole("heading", { name: "Admin" })).not.toBeNull();
    expect(screen.getByTestId("premier-featured-editor")).not.toBeNull();
    expect(screen.getByTestId("academy-featured-editor")).not.toBeNull();
    expect(screen.queryByRole("region", { name: "League controls" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Banger Board" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Drafts" })).toBeNull();
    expect(screen.queryByRole("heading", { name: "Staff" })).toBeNull();
  });

  it("keeps the existing redirect for a non-staff visitor", async () => {
    fetchStaffTier.mockResolvedValue({ isAdmin: false, isOwner: false, isBroadcaster: false });
    redirect.mockImplementation(() => {
      throw new Error("redirected");
    });

    await expect(AdminPage()).rejects.toThrow("redirected");
    expect(redirect).toHaveBeenCalledWith("/");
    expect(editor).not.toHaveBeenCalled();
  });
});
