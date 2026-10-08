import { describe, expect, it } from "vitest";
import { claimableSpots, findSpot, lockInCounts, lockInOpen, lockInState } from "./lockIn";
import type { OffseasonEntrant } from "./types";

function entrant(overrides: Partial<OffseasonEntrant> = {}): OffseasonEntrant {
  return {
    id: "e1",
    event_id: "event",
    profile_id: "p1",
    display_name: "Pat",
    riot_id: "Pat Doe#NA1",
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

describe("lockInState", () => {
  it("asks a player with a role to lock in", () => {
    expect(lockInState(entrant())).toBe("pending");
  });

  it("counts a lock-in only for the role the player holds now", () => {
    expect(lockInState(entrant({ locked_in_role: "mid", locked_in_at: "2026-10-02" }))).toBe("locked");
    expect(lockInState(entrant({ assigned_role: "top", locked_in_role: "mid", locked_in_at: "2026-10-02" }))).toBe("role_changed");
  });

  it("has nothing to confirm before roles or for players not playing", () => {
    expect(lockInState(entrant({ assigned_role: null }))).toBe("no_role");
    expect(lockInState(entrant({ status: "benched" }))).toBe("not_playing");
    expect(lockInState(entrant({ status: "withdrawn", locked_in_role: "mid", locked_in_at: "2026-10-02" }))).toBe("not_playing");
  });
});

describe("lockInCounts", () => {
  it("counts locked-in players out of those with a role", () => {
    const counts = lockInCounts([
      entrant({ locked_in_role: "mid", locked_in_at: "x" }),
      entrant({ assigned_role: "top", locked_in_role: "mid", locked_in_at: "x" }),
      entrant(),
      entrant({ status: "benched" }),
      entrant({ assigned_role: null }),
    ]);
    expect(counts).toEqual({ locked: 1, playing: 3 });
  });
});

describe("lockInOpen", () => {
  const running = { status: "running" as const };
  const locked = entrant({ locked_in_role: "mid", locked_in_at: "x" });

  it("waits for roles and closes when the event is over", () => {
    expect(lockInOpen(running, [entrant({ assigned_role: null })], null)).toBe(false);
    expect(lockInOpen(running, [entrant()], null)).toBe(true);
    expect(lockInOpen({ status: "complete" }, [entrant()], entrant())).toBe(false);
  });

  it("stays open for players in the event once everyone is locked in", () => {
    expect(lockInOpen(running, [locked], null)).toBe(false);
    expect(lockInOpen(running, [locked], locked)).toBe(true);
  });
});

describe("claimable spots", () => {
  const spots = claimableSpots([
    entrant({ id: "a", profile_id: null, display_name: "Staff Added", riot_id: "Flyinq squirtle#na1", assigned_role: "top" }),
    entrant({ id: "b", profile_id: "p2", riot_id: "Has Account#NA1" }),
    entrant({ id: "c", profile_id: null, riot_id: "Sitting Out#NA1", status: "benched" }),
    entrant({ id: "d", profile_id: null, riot_id: "No Role#NA1", assigned_role: null }),
  ]);

  it("lists only unlinked players who have a role", () => {
    expect(spots).toEqual([{ displayName: "Staff Added", riotId: "Flyinq squirtle#na1", role: "top" }]);
  });

  it("finds a spot by Riot ID, ignoring case and spaces", () => {
    expect(findSpot(spots, " FlyinqSquirtle#NA1 ")?.riotId).toBe("Flyinq squirtle#na1");
    expect(findSpot(spots, "Has Account#NA1")).toBeNull();
    expect(findSpot(spots, "flyinq squirtle")).toBeNull();
  });
});
