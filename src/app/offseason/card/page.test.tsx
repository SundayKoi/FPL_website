import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OffseasonEntrant } from "@/lib/offseason/types";

const { loadOffseasonPage, fetchSignatures } = vi.hoisted(() => ({ loadOffseasonPage: vi.fn(), fetchSignatures: vi.fn() }));
vi.mock("@/lib/offseason/page", () => ({ loadOffseasonPage }));
vi.mock("@/lib/offseason/queries", () => ({ fetchSignatures }));
vi.mock("@/lib/supabase/server", () => ({ createServerSupabase: vi.fn(async () => ({})) }));
vi.mock("@/lib/offseason/actions", () => ({ signCardAction: vi.fn() }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/components/cards/PlayerCard3D", () => ({ default: () => <div data-testid="card" /> }));

import OffseasonCardPage from "./page";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const entrant = (id: string, overrides: Partial<OffseasonEntrant> = {}) =>
  ({ id, display_name: id, riot_id: `${id}#OS1`, profile_id: null, status: "active", assigned_role: "mid", primary_role: "mid", ...overrides }) as OffseasonEntrant;

const view = (entrants: OffseasonEntrant[], status = "running") => ({
  event: { id: "event", name: "Offseason Cup", status },
  entrants,
  ratings: new Map(),
});

describe("offseason card page", () => {
  it("asks visitors to sign in", async () => {
    loadOffseasonPage.mockResolvedValue({ view: view([]), userId: null, isStaff: false, ownEntry: null });
    render(await OffseasonCardPage());
    expect(screen.getByRole("link", { name: "Sign in" }).getAttribute("href")).toBe("/login?redirect=/offseason/card");
    expect(screen.getByRole("link", { name: "Your card" }).getAttribute("aria-current")).toBe("page");
  });

  it("gives a player the pad for their own card", async () => {
    const me = entrant("Me", { profile_id: "me" });
    fetchSignatures.mockResolvedValue(new Map([["Me", "data:image/png;base64,AAAA"]]));
    loadOffseasonPage.mockResolvedValue({ view: view([me]), userId: "me", isStaff: false, ownEntry: me });
    render(await OffseasonCardPage());
    expect(screen.getByRole("heading", { name: "Me" })).toBeTruthy();
    expect(screen.getByText(/Signed\. Draw a new one/)).toBeTruthy();
    expect(fetchSignatures).toHaveBeenCalledWith({}, ["Me"]);
  });

  it("lets a member without an entry claim an unclaimed card", async () => {
    loadOffseasonPage.mockResolvedValue({
      view: view([entrant("Taken", { profile_id: "someone" }), entrant("Open"), entrant("Gone", { status: "withdrawn" })]),
      userId: "me",
      isStaff: false,
      ownEntry: null,
    });
    render(await OffseasonCardPage());
    expect(screen.getByRole("button", { name: "Find my card" })).toBeTruthy();
    expect(fetchSignatures).not.toHaveBeenCalled();
  });

  it("explains when every card is claimed or the event is over", async () => {
    loadOffseasonPage.mockResolvedValue({ view: view([entrant("Taken", { profile_id: "someone" })]), userId: "me", isStaff: false, ownEntry: null });
    const { unmount } = render(await OffseasonCardPage());
    expect(screen.getByText(/every card has been claimed/)).toBeTruthy();
    unmount();

    const me = entrant("Me", { profile_id: "me" });
    fetchSignatures.mockResolvedValue(new Map());
    loadOffseasonPage.mockResolvedValue({ view: view([me], "complete"), userId: "me", isStaff: false, ownEntry: me });
    render(await OffseasonCardPage());
    expect(screen.getByText(/event is over/)).toBeTruthy();
  });
});
