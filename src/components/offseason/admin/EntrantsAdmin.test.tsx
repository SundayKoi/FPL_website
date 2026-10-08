import { fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OffseasonEntrant } from "@/lib/offseason/types";
import type { OffseasonAdminData } from "./shared";

const { setLockInAction } = vi.hoisted(() => ({ setLockInAction: vi.fn() }));
vi.mock("@/lib/offseason/actions", () => ({
  setLockInAction,
  addEntrantAction: vi.fn(),
  applyRolesAction: vi.fn(),
  deleteEntrantAction: vi.fn(),
  updateEntrantAction: vi.fn(),
}));

import EntrantsAdmin from "./EntrantsAdmin";

beforeEach(() => {
  vi.clearAllMocks();
  setLockInAction.mockResolvedValue({ ok: true });
});

function entrant(id: string, overrides: Partial<OffseasonEntrant> = {}): OffseasonEntrant {
  return {
    id,
    event_id: "event",
    profile_id: null,
    display_name: id,
    riot_id: `${id}#OS1`,
    opgg_url: null,
    current_rank: null,
    primary_role: "mid",
    secondary_role: null,
    assigned_role: "mid",
    status: "active",
    eliminated_week: null,
    signed_up_at: "2026-10-01T00:00:00Z",
    locked_in_role: null,
    locked_in_at: null,
    ...overrides,
  };
}

function data(entrants: OffseasonEntrant[]): OffseasonAdminData {
  return {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants,
    weeks: [],
    entries: [],
    teams: [],
    members: [],
    matches: [],
    games: [],
    ratings: {},
    drafts: {},
  };
}

const row = (name: string) => screen.getByRole("link", { name }).closest("tr")!;

describe("EntrantsAdmin lock-in", () => {
  const entrants = [
    entrant("Locked", { locked_in_role: "mid", locked_in_at: "2026-10-02T00:00:00Z" }),
    entrant("Moved", { assigned_role: "top", locked_in_role: "mid", locked_in_at: "2026-10-02T00:00:00Z" }),
    entrant("Waiting"),
    entrant("Benched", { status: "benched" }),
  ];

  it("shows who has locked in out of those playing", () => {
    render(<EntrantsAdmin data={data(entrants)} />);
    expect(screen.getByText(/Locked in/, { selector: "span.text-xs.text-muted" }).textContent).toBe("Locked in 1 of 3 playing");
    expect(within(row("Locked")).getByText("Locked in")).toBeTruthy();
    expect(within(row("Moved")).getByText("Was MID")).toBeTruthy();
    expect(within(row("Waiting")).getByText("Not yet")).toBeTruthy();
    expect(within(row("Benched")).queryByRole("button", { name: "Mark" })).toBeNull();
  });

  it("lets staff record a lock-in for the current role, or clear one", async () => {
    render(<EntrantsAdmin data={data(entrants)} />);
    fireEvent.click(within(row("Moved")).getByRole("button", { name: "Mark" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Moved locked in as Top."));
    expect(setLockInAction).toHaveBeenCalledWith("Moved", "top");
    const clear = within(row("Locked")).getByRole("button", { name: "Clear" }) as HTMLButtonElement;
    await waitFor(() => expect(clear.disabled).toBe(false));
    fireEvent.click(clear);
    await waitFor(() => expect(setLockInAction).toHaveBeenCalledWith("Locked", null));
  });
});
