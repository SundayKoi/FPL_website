import { cleanup, render, screen, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { LolRole } from "@/lib/draft/types";
import type { OffseasonEntrant, OffseasonEventData } from "@/lib/offseason/types";
import { buildOffseasonView } from "@/lib/offseason/view";

const { loadOffseasonPage, notFound } = vi.hoisted(() => ({
  loadOffseasonPage: vi.fn(),
  notFound: vi.fn(() => {
    throw new Error("NOT_FOUND");
  }),
}));
vi.mock("@/lib/offseason/page", () => ({ loadOffseasonPage }));
vi.mock("next/navigation", () => ({ notFound, useRouter: () => ({ refresh: vi.fn() }) }));

import OffseasonPage from "./page";
import OffseasonPlayerPage from "./players/[id]/page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const ROLES: LolRole[] = ["top", "jungle", "mid", "adc", "support"];

function entrant(id: string, role: LolRole, overrides: Partial<OffseasonEntrant> = {}): OffseasonEntrant {
  return {
    id,
    event_id: "event",
    profile_id: null,
    display_name: id,
    riot_id: `${id}#OS1`,
    opgg_url: "javascript:alert(1)",
    current_rank: "Gold 1",
    primary_role: role,
    secondary_role: null,
    assigned_role: role,
    status: "active",
    eliminated_week: null,
    signed_up_at: `2026-10-01T00:00:0${ROLES.indexOf(role)}Z`,
    locked_in_role: null,
    locked_in_at: null,
    ...overrides,
  };
}

function fixture(): OffseasonEventData {
  const blue = ROLES.map((role) => entrant(`Blue ${role}`, role));
  const red = ROLES.map((role) => entrant(`Red ${role}`, role));
  return {
    event: { id: "event", name: "Offseason Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [...blue, ...red, entrant("Gone mid", "mid", { status: "eliminated", eliminated_week: 3 })],
    weeks: [{ id: "w1", event_id: "event", week_number: 1, status: "playing", elimination_per_role: 0, main_draft_id: "d1", elimination_draft_id: null, created_at: "" }],
    entries: [],
    teams: [
      { id: "tb", week_id: "w1", tier: "main", name: "Team Blue", captain_entrant_id: "Blue top", draft_team_id: null, eliminated: false },
      { id: "tr", week_id: "w1", tier: "main", name: "Team Red", captain_entrant_id: "Red top", draft_team_id: null, eliminated: false },
    ],
    members: [
      ...blue.map((player) => ({ team_id: "tb", entrant_id: player.id, role: player.assigned_role!, price: 5 })),
      ...red.map((player) => ({ team_id: "tr", entrant_id: player.id, role: player.assigned_role!, price: 5 })),
    ],
    matches: [{ id: "m1", week_id: "w1", stage: "round_robin", sort_order: 1, team_a_id: "tb", team_b_id: "tr", best_of: 1, winner_team_id: "tb" }],
    games: [{ id: "g1", match_id: "m1", game_number: 1, riot_match_id: "NA1_1000000001", winner_team_id: "tb", ingested_at: "2026-10-20", ingest_error: null }],
  };
}

describe("offseason pages", () => {
  it("shows a placeholder before the event exists", async () => {
    loadOffseasonPage.mockResolvedValue({ view: null, userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPage());
    expect(screen.getByText(/has not been set up yet/i)).toBeTruthy();
    expect(screen.queryByRole("link", { name: "Admin" })).toBeNull();
  });

  it("renders the week, standings and leaderboards", async () => {
    const view = buildOffseasonView(fixture(), []);
    loadOffseasonPage.mockResolvedValue({ view, userId: null, isStaff: true, ownEntry: null });
    render(await OffseasonPage());
    expect(screen.getByRole("heading", { name: "Offseason Cup" })).toBeTruthy();
    const week = screen.getByRole("heading", { name: "Week 1" }).closest("section")!;
    expect(within(week).getAllByText("Team Blue").length).toBeGreaterThan(0);
    expect(within(week).getByText("Round robin", { selector: "h3" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Eliminated" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "Admin" }).getAttribute("href")).toBe("/offseason/admin");
  });

  it("asks a player with a role to lock in, and leaves spectators alone once everyone has", async () => {
    const view = buildOffseasonView(fixture(), []);
    const me = view.entrants.find((player) => player.id === "Blue mid")!;
    loadOffseasonPage.mockResolvedValue({ view, userId: "me", isStaff: false, ownEntry: me });
    const { unmount } = render(await OffseasonPage());
    expect(screen.getByRole("button", { name: "Lock in as Mid" })).toBeTruthy();
    unmount();

    const done = fixture();
    done.entrants = done.entrants.map((player) => ({ ...player, locked_in_role: player.assigned_role, locked_in_at: "2026-10-02" }));
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(done, []), userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPage());
    expect(screen.queryByRole("heading", { name: "Lock in your role" })).toBeNull();
  });

  it("renders a player's page without trusting their op.gg link", async () => {
    const view = buildOffseasonView(fixture(), []);
    loadOffseasonPage.mockResolvedValue({ view, userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonPlayerPage({ params: Promise.resolve({ id: "Blue mid" }) }));
    expect(screen.getByRole("heading", { name: "Blue mid" })).toBeTruthy();
    expect(screen.getByText(/Won 1–0/)).toBeTruthy();
    expect(screen.queryByRole("link", { name: /op\.gg/ })).toBeNull();
  });

  it("404s an unknown player", async () => {
    loadOffseasonPage.mockResolvedValue({ view: buildOffseasonView(fixture(), []), userId: null, isStaff: false, ownEntry: null });
    await expect(OffseasonPlayerPage({ params: Promise.resolve({ id: "nobody" }) })).rejects.toThrow("NOT_FOUND");
  });
});
