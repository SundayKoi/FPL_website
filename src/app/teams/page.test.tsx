import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import TeamsPage from "./page";

const { getUser, from } = vi.hoisted(() => ({
  getUser: vi.fn(),
  from: vi.fn(),
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
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
  };
  return builder;
}

const selectedTeam = {
  id: "team-live",
  draft_id: "draft-live",
  name: "Live Team",
  captain_profile_id: "profile-live",
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

afterEach(() => {
  cleanup();
  getUser.mockReset();
  from.mockReset();
});

describe("TeamsPage", () => {
  it("shows the placeholder preview and admin selector when no draft is featured", async () => {
    getUser.mockResolvedValue({ data: { user: { id: "admin-1" } } });
    from.mockImplementation((table: string) => {
      if (table === "profiles") return query({ data: { is_admin: true } });
      if (table === "league_settings") return query({ data: { featured_draft_id: null } });
      return query({ data: [{ id: "draft-1", name: "Draft One" }] });
    });

    render(await TeamsPage());

    expect(screen.getByText("PREVIEW DATA")).toBeTruthy();
    expect(screen.getAllByRole("article")).toHaveLength(12);
    expect(screen.getByLabelText("Display draft")).toBeTruthy();
  });

  it("renders the selected draft instead of preview data", async () => {
    getUser.mockResolvedValue({ data: { user: null } });
    from.mockImplementation((table: string) => {
      if (table === "league_settings") return query({ data: { featured_draft_id: "draft-live" } });
      if (table === "drafts") return query({ data: { id: "draft-live", name: "Split 5" } });
      if (table === "teams") return query({ data: [selectedTeam] });
      if (table === "players") return query({ data: selectedPlayers });
      return query({ data: null });
    });

    render(await TeamsPage());

    expect(screen.getByText("Split 5")).toBeTruthy();
    expect(screen.queryByText("PREVIEW DATA")).toBeNull();
    expect(screen.getByText("Live Team")).toBeTruthy();
    expect(screen.queryByLabelText("Display draft")).toBeNull();
  });
});
