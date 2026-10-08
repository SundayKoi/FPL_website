import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import type { OffseasonEntrant } from "@/lib/offseason/types";

const { lockInAction, refresh } = vi.hoisted(() => ({ lockInAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/offseason/actions", () => ({ lockInAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import LockIn from "./LockIn";

beforeEach(() => {
  vi.clearAllMocks();
  lockInAction.mockResolvedValue({ ok: true });
});

function entry(overrides: Partial<OffseasonEntrant> = {}): OffseasonEntrant {
  return {
    id: "e1",
    event_id: "event-1",
    profile_id: "p1",
    display_name: "Pat",
    riot_id: "Pat Doe#NA1",
    opgg_url: null,
    current_rank: null,
    primary_role: "top",
    secondary_role: "mid",
    assigned_role: "mid",
    status: "active",
    eliminated_week: null,
    signed_up_at: "2026-10-01T00:00:00Z",
    locked_in_role: null,
    locked_in_at: null,
    ...overrides,
  };
}

const spots = [{ displayName: "Flyinq", riotId: "Flyinq squirtle#na1", role: "top" as const }];

describe("LockIn", () => {
  it("locks in the role the player was given", async () => {
    render(<LockIn eventId="event-1" signedIn entry={entry()} spots={[]} />);
    expect(screen.getByText(/Message staff in Discord instead/)).toBeTruthy();
    fireEvent.click(screen.getByRole("button", { name: "Lock in as Mid" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toContain("locked in as Mid"));
    expect(lockInAction).toHaveBeenCalledWith({ eventId: "event-1", role: "mid", riotId: undefined });
  });

  it("asks again after a role change and shows what changed", () => {
    render(<LockIn eventId="event-1" signedIn entry={entry({ locked_in_role: "top", locked_in_at: "2026-10-02" })} spots={[]} />);
    expect(screen.getByText(/moved you from Top to Mid/)).toBeTruthy();
    expect(screen.getByRole("button", { name: "Lock in as Mid" })).toBeTruthy();
  });

  it("confirms a player who is locked in, and tells a benched player they sit out", () => {
    const { unmount } = render(<LockIn eventId="event-1" signedIn entry={entry({ locked_in_role: "mid", locked_in_at: "2026-10-02" })} spots={[]} />);
    expect(screen.getByRole("heading", { name: "Locked in" })).toBeTruthy();
    expect(screen.queryByRole("button")).toBeNull();
    unmount();
    render(<LockIn eventId="event-1" signedIn entry={entry({ status: "benched" })} spots={[]} />);
    expect(screen.getByRole("heading", { name: "Sitting out" })).toBeTruthy();
  });

  it("shows the database's refusal and reloads the role", async () => {
    lockInAction.mockResolvedValue({ ok: false, error: "your role has changed, check it and lock in again" });
    render(<LockIn eventId="event-1" signedIn entry={entry()} spots={[]} />);
    fireEvent.click(screen.getByRole("button", { name: "Lock in as Mid" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toContain("role has changed"));
    expect(refresh).toHaveBeenCalled();
  });

  it("lets a staff-added player find their spot by Riot ID and claim it", async () => {
    render(<LockIn eventId="event-1" signedIn entry={null} spots={spots} />);
    fireEvent.change(screen.getByLabelText(/^Riot ID/), { target: { value: "nobody#na1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find my spot" }));
    expect(screen.getByText(/No open spot has that Riot ID/)).toBeTruthy();

    fireEvent.change(screen.getByLabelText(/^Riot ID/), { target: { value: "FlyinqSquirtle#NA1" } });
    fireEvent.click(screen.getByRole("button", { name: "Find my spot" }));
    fireEvent.click(screen.getByRole("button", { name: "Lock in as Top" }));
    await waitFor(() => expect(lockInAction).toHaveBeenCalled());
    expect(lockInAction).toHaveBeenCalledWith({ eventId: "event-1", role: "top", riotId: "Flyinq squirtle#na1" });
  });

  it("asks a visitor to sign in", () => {
    render(<LockIn eventId="event-1" signedIn={false} entry={null} spots={spots} />);
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?redirect=/offseason");
  });
});
