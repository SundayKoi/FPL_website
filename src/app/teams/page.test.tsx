import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TeamsPage from "./page";

const { getUser, from, profileIdsIn, profileOrder } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
  profileIdsIn: vi.fn(),
  profileOrder: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({
  createServerSupabase: vi.fn(async () => ({
    auth: { getUser },
    from,
  })),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: vi.fn() }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh: vi.fn() }),
}));

function query(result: unknown) {
  const builder = {
    select: (...columns: string[]) => {
      void columns;
      return builder;
    },
    eq: () => builder,
    in: () => Promise.resolve(result),
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    maybeSingle: () => Promise.resolve(result),
  };
  return builder;
}

function profilesQuery(adminResult: unknown, captainProfilesResult: unknown) {
  return {
    select: (columns: string) => {
      // Matched loosely: fetchStaffTier's column list grows as staff roles are
      // added (is_broadcaster joined it), and an exact-string match silently
      // routed the staff read to the captain-profiles branch instead.
      if (columns.startsWith("is_admin, is_owner")) return query(adminResult);

      const profileRows = (captainProfilesResult as { data?: Array<{ id: string }> }).data ?? [];
      const builder = query(captainProfilesResult);
      builder.in = profileIdsIn.mockImplementation((column: string, ids: string[]) => Promise.resolve({
        data: column === "id" ? profileRows.filter((profile) => ids.includes(profile.id)) : [],
      }));
      builder.order = profileOrder.mockImplementation(() => Promise.resolve(captainProfilesResult));
      return builder;
    },
  };
}

function draftsQuery(draftsResult: unknown, selectedDraftResult: unknown) {
  const builder = query(selectedDraftResult);
  builder.select = (columns?: string) => query(columns === "id, name" ? draftsResult : selectedDraftResult);
  return builder;
}

const selectedTeam = {
  id: "team-live",
  draft_id: "draft-live",
  name: "Live Team",
  captain_profile_id: "profile-live",
  abbreviation: "LT",
  image_url: "https://img.test/live",
  banner_color: "#123456",
  nomination_position: 1,
  budget_start: 100,
  points_remaining: 72,
};

const selectedPlayers = [
  ["live-captain", "Captain Live", "top", "captain", 0],
  ["live-jungle", "Jungle Live", "jungle", "free_agency", 0],
  ["live-mid", "Mid Live", "mid", "auction", 12],
  ["live-adc", "Adc Live", "adc", "auction", 11],
  ["live-support", "Support Live", "support", "auction", 9],
].map(([id, display_name, role, acquisition, price]) => ({
  id,
  draft_id: "draft-live",
  display_name,
  role,
  rank: null,
  opgg_url: null,
  notes: null,
  team_id: "team-live",
  price: Number(price),
  acquisition,
}));

const academyDraft = { id: "draft-academy", name: "S1 Academy" };
const academyTeam = { ...selectedTeam, id: "team-academy", draft_id: "draft-academy", name: "Academy Team" };

const selectedCaptainProfile = {
  id: "profile-live",
  display_name: "Captain Profile",
};

const availableCaptainProfile = {
  id: "profile-available",
  display_name: "Available Captain",
};

afterEach(() => {
  cleanup();
  getUser.mockReset();
  from.mockReset();
  profileIdsIn.mockReset();
  profileOrder.mockReset();
});

describe("TeamsPage", () => {
  it("shows the placeholder preview and admin selector when no draft is featured", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    from.mockImplementation((table: string) => {
      if (table === "profiles") return profilesQuery({ data: { is_admin: true, is_owner: true } }, { data: [] });
      if (table === "league_settings") return query({ data: { featured_draft_id: null } });
      return query({ data: [{ id: "draft-1", name: "Draft One" }] });
    });

    render(await TeamsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("PREVIEW DATA")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(screen.getByLabelText("Premier draft")).toBeTruthy();
    expect(screen.getByLabelText("Academy draft")).toBeTruthy();
    expect(screen.getByRole("region", { name: "Team rosters" }).querySelector(".grid")?.classList).toContain(
      "sm:grid-cols-3",
    );
  });

  it("shows the selected captain profile in the admin team editor", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return profilesQuery(
          { data: { is_admin: true } },
          { data: [selectedCaptainProfile, availableCaptainProfile] },
        );
      }
      if (table === "league_settings") return query({ data: { featured_draft_id: "draft-live" } });
      if (table === "drafts") {
        return draftsQuery(
          { data: [{ id: "draft-live", name: "Split 5" }] },
          { data: { id: "draft-live", name: "Split 5" } },
        );
      }
      if (table === "teams") return query({ data: [selectedTeam] });
      if (table === "players") return query({ data: selectedPlayers });
      return query({ data: null });
    });

    render(await TeamsPage({ searchParams: Promise.resolve({}) }));

    expect(
      screen.getByText((_, element) => element?.tagName === "P" && element.textContent?.trim() === "Captain Captain Live"),
    ).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));

    expect(screen.getByRole("option", { name: "Captain Profile" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Available Captain" })).toBeTruthy();
    expect(profileIdsIn).not.toHaveBeenCalled();
    expect(profileOrder).toHaveBeenCalledWith("display_name");
  });

  it("renders the selected draft profile without an editor for non-admins", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    from.mockImplementation((table: string) => {
      if (table === "profiles") return profilesQuery({ data: { is_admin: false } }, { data: [selectedCaptainProfile] });
      if (table === "league_settings") return query({ data: { featured_draft_id: "draft-live" } });
      if (table === "drafts") return query({ data: { id: "draft-live", name: "Split 5" } });
      if (table === "teams") return query({ data: [selectedTeam] });
      if (table === "players") return query({ data: selectedPlayers });
      return query({ data: null });
    });

    render(await TeamsPage({ searchParams: Promise.resolve({}) }));

    expect(screen.getByText("Split 5")).toBeTruthy();
    expect(screen.queryByText("PREVIEW DATA")).toBeNull();
    expect(screen.getByText("Live Team")).toBeTruthy();
    expect(screen.queryByLabelText("Display draft")).toBeNull();
    expect(screen.getByText((_, element) => element?.tagName === "P" && element.textContent?.trim() === "Captain Captain Live"))
      .toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit teams" })).toBeNull();
  });

  it("loads the S1 Academy draft and presents the Academy view", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    from.mockImplementation((table: string) => {
      if (table === "profiles") return profilesQuery({ data: { is_admin: false } }, { data: [selectedCaptainProfile] });
      if (table === "league_settings") return query({ data: { featured_draft_id: "draft-live" } });
      if (table === "drafts") return query({ data: academyDraft });
      if (table === "teams") return query({ data: [academyTeam] });
      if (table === "players") return query({ data: selectedPlayers.map((player) => ({ ...player, draft_id: "draft-academy", team_id: "team-academy" })) });
      return query({ data: null });
    });

    render(await TeamsPage({ searchParams: Promise.resolve({ view: "academy" }) }));

    expect(screen.getByRole("heading", { name: "Academy Teams" })).toBeTruthy();
    expect(screen.getByText("Academy Team")).toBeTruthy();
    expect(screen.getByRole("link", { name: "Premier" }).getAttribute("href")).toBe("/teams");
    expect(screen.getByRole("link", { name: "Academy" }).className).toContain("bg-coral");
  });

  it("lets admins edit Academy teams", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    from.mockImplementation((table: string) => {
      if (table === "profiles") {
        return profilesQuery({ data: { is_admin: true } }, { data: [selectedCaptainProfile] });
      }
      if (table === "league_settings") {
        return query({ data: { featured_draft_id: "draft-live", academy_draft_id: "draft-academy" } });
      }
      if (table === "drafts") return query({ data: [academyDraft] });
      if (table === "teams") return query({ data: [academyTeam] });
      if (table === "players") {
        return query({
          data: selectedPlayers.map((player) => ({ ...player, draft_id: "draft-academy", team_id: "team-academy" })),
        });
      }
      return query({ data: null });
    });

    render(await TeamsPage({ searchParams: Promise.resolve({ view: "academy" }) }));

    fireEvent.click(screen.getByRole("button", { name: "Edit teams" }));
    expect(screen.getByLabelText("Academy Team name")).toBeTruthy();
  });
});
