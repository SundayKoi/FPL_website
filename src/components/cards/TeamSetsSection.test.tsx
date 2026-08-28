import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { WeekTeamSet } from "@/lib/cards/sets";

const claimTeamSetAction = vi.fn();
const refresh = vi.fn();
vi.mock("@/lib/cards/setActions", () => ({ claimTeamSetAction: (...args: unknown[]) => claimTeamSetAction(...args) }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import TeamSetsSection from "./TeamSetsSection";

const WEEK = "2026-08-24";
const ROLES = ["Top", "Jungle", "Mid", "Bot", "Support"];

function set({
  teamName,
  ownedCount,
  ...over
}: Partial<WeekTeamSet> & { teamName: string; ownedCount: number }): WeekTeamSet {
  const members = ROLES.map((role, i) => ({
    slug: `${teamName}-${role}`.toLowerCase(),
    name: `${teamName} ${role}`,
    role,
    overall: 70,
    copyId: i < ownedCount ? i + 1 : null,
  }));
  return {
    teamName,
    imageUrl: null,
    weekStart: WEEK,
    members,
    ownedCount,
    complete: ownedCount === 5,
    copyIds: ownedCount === 5 ? members.map((m) => m.copyId as number) : [],
    ...over,
  };
}

function renderSection(over: Partial<Parameters<typeof TeamSetsSection>[0]> = {}) {
  return render(
    <TeamSetsSection
      season="S5"
      initialWeek={WEEK}
      weeks={[
        {
          week: WEEK,
          sets: [set({ teamName: "Wolves", ownedCount: 5 }), set({ teamName: "Bears", ownedCount: 3 })],
          claimed: [],
        },
      ]}
      {...over}
    />,
  );
}

afterEach(cleanup);
beforeEach(() => {
  claimTeamSetAction.mockReset();
  refresh.mockReset();
});

describe("TeamSetsSection", () => {
  it("offers the money only on a finished set, and names what's missing on the rest", () => {
    renderSection();

    expect(screen.getByRole("button", { name: "Claim the Wolves set" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Claim the Bears set" })).toBeNull();
    // The two it still needs, by name, so the chase says what to look for.
    const bears = screen.getByTestId("set-Bears");
    expect(within(bears).getByText("Bears Bot")).toBeTruthy();
    expect(within(bears).getByText("Bears Support")).toBeTruthy();
    expect(within(bears).getByText("3/5")).toBeTruthy();
  });

  it("claims by week and team only — never by which copies to spend", async () => {
    // A browser that could name the five would be a browser that could
    // name five it doesn't own. The server recomputes them.
    claimTeamSetAction.mockResolvedValue({ ok: true, teamName: "Wolves", weekStart: WEEK, amount: 100, balance: 900 });
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Claim the Wolves set" }));

    await waitFor(() => expect(claimTeamSetAction).toHaveBeenCalledWith("S5", WEEK, "Wolves"));
    await waitFor(() => expect(refresh).toHaveBeenCalled());
  });

  it("stops offering the money the moment it is paid, without waiting for the refresh", async () => {
    claimTeamSetAction.mockResolvedValue({ ok: true, teamName: "Wolves", weekStart: WEEK, amount: 100, balance: 900 });
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Claim the Wolves set" }));

    await waitFor(() => expect(screen.queryByRole("button", { name: "Claim the Wolves set" })).toBeNull());
    expect(within(screen.getByTestId("set-Wolves")).getByText("Claimed · +$100")).toBeTruthy();
  });

  it("shows a refusal in place rather than swallowing it", async () => {
    claimTeamSetAction.mockResolvedValue({ ok: false, error: "You've already been paid for that set." });
    renderSection();

    fireEvent.click(screen.getByRole("button", { name: "Claim the Wolves set" }));

    await waitFor(() =>
      expect(screen.getByTestId("set-claim-error").textContent).toContain("already been paid"),
    );
    // And the button comes back, because nothing was spent.
    expect(screen.getByRole("button", { name: "Claim the Wolves set" })).toBeTruthy();
  });

  it("marks a set the server already paid for", () => {
    // Its five copies are spent, so it arrives as 0/5 — without the
    // claimed list the row would look like the cards went missing.
    renderSection({ weeks: [{ week: WEEK, sets: [set({ teamName: "Wolves", ownedCount: 0 })], claimed: ["Wolves"] }] });

    expect(within(screen.getByTestId("set-Wolves")).getByText("Claimed · +$100")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Claim the Wolves set" })).toBeNull();
  });

  it("only offers the week switch when there is more than one week held", () => {
    renderSection();
    expect(screen.queryByText("Week")).toBeNull();
  });

  it("switches weeks without a page navigation", () => {
    // It used to be a link, which re-ran the whole collection page to
    // change which five names a small section listed.
    renderSection({
      weeks: [
        { week: WEEK, sets: [set({ teamName: "Wolves", ownedCount: 5 })], claimed: [] },
        { week: "2026-08-17", sets: [set({ teamName: "Bears", ownedCount: 2 })], claimed: [] },
      ],
    });
    expect(screen.queryByTestId("set-Bears")).toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Show the week of Aug 17" }));

    expect(screen.getByTestId("set-Bears")).toBeTruthy();
    expect(screen.queryByTestId("set-Wolves")).toBeNull();
    // No links at all in the switch — nothing here navigates.
    expect(screen.queryByRole("link", { name: /Aug/ })).toBeNull();
  });

  it("dots the weeks with money still sitting in them", () => {
    renderSection({
      weeks: [
        { week: WEEK, sets: [set({ teamName: "Wolves", ownedCount: 2 })], claimed: [] },
        { week: "2026-08-17", sets: [set({ teamName: "Bears", ownedCount: 5 })], claimed: [] },
      ],
    });
    // Otherwise the only way to find a claimable week is to click them all.
    const ready = screen.getByRole("button", { name: "Show the week of Aug 17" });
    expect(within(ready).getByLabelText("has a set ready to claim")).toBeTruthy();
    expect(
      within(screen.getByRole("button", { name: "Show the week of Aug 24" })).queryByLabelText(
        "has a set ready to claim",
      ),
    ).toBeNull();
  });

  it("renders nothing at all when no team fielded a full five that week", () => {
    const { container } = renderSection({ weeks: [{ week: WEEK, sets: [], claimed: [] }] });
    expect(container.firstChild).toBeNull();
  });
});
