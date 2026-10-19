import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MvpOpenWeek, WeekLine } from "@/lib/offseason/mvp";

const { voteMvpAction, refresh } = vi.hoisted(() => ({ voteMvpAction: vi.fn(), refresh: vi.fn() }));
vi.mock("@/lib/offseason/actions", () => ({ voteMvpAction }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh }) }));

import MvpVote from "./MvpVote";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

const week = (overrides: Partial<MvpOpenWeek> = {}): MvpOpenWeek => ({
  weekId: "w2",
  weekNumber: 2,
  total: 1,
  myVote: null,
  nominees: [
    { entrantId: "a", name: "Ace", role: "mid", teamName: "Team One", self: false, line: line({ overall: 88, games: 3, wins: 2, losses: 1, champions: ["Ahri", "Syndra"] }) },
    { entrantId: "me", name: "Myself", role: "top", teamName: "Team One", self: true, line: line() },
  ],
  ...overrides,
});

function line(overrides: Partial<WeekLine> = {}): WeekLine {
  return {
    overall: null,
    games: 0,
    wins: 0,
    losses: 0,
    kills: 6,
    deaths: 2,
    assists: 9.5,
    kda: 7.75,
    csPerMin: 7.4,
    damagePerMin: 612.4,
    visionPerMin: 1.1,
    champions: [],
    ...overrides,
  };
}

describe("MvpVote", () => {
  it("votes and marks the pick as the member's vote", async () => {
    voteMvpAction.mockResolvedValue({ ok: true });
    render(<MvpVote week={week()} signedIn />);
    expect(screen.getByText(/1 vote so far/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: /Myself/ })).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Vote for Ace" }));
    await screen.findByRole("button", { name: "Your vote: Ace" });
    expect(voteMvpAction).toHaveBeenCalledWith("w2", "a");
    expect(refresh).toHaveBeenCalled();
  });

  it("shows why a vote was refused", async () => {
    voteMvpAction.mockResolvedValue({ ok: false, error: "voting on week 2 is closed" });
    render(<MvpVote week={week()} signedIn />);
    fireEvent.click(screen.getByRole("button", { name: "Vote for Ace" }));
    expect((await screen.findByRole("alert")).textContent).toBe("voting on week 2 is closed");
    await waitFor(() => expect((screen.getByRole("button", { name: "Vote for Ace" }) as HTMLButtonElement).disabled).toBe(false));
  });

  it("lays the nominees out side by side with their week", () => {
    render(<MvpVote week={week()} signedIn />);
    const ace = screen.getByRole("article", { name: "Ace" });
    expect(within(ace).getByText("MID · Team One")).toBeTruthy();
    expect(within(ace).getByText("88")).toBeTruthy();
    expect(within(ace).getByText("2–1")).toBeTruthy();
    expect(within(ace).getByText("6.0 / 2.0 / 9.5")).toBeTruthy();
    expect(within(ace).getByText("7.75")).toBeTruthy();
    expect(within(ace).getByText("612")).toBeTruthy();
    expect(within(ace).getByText("Played Ahri, Syndra")).toBeTruthy();
    const me = screen.getByRole("article", { name: "Myself" });
    expect(within(me).getByText("No games ingested yet.")).toBeTruthy();
    expect(within(me).getByText("You")).toBeTruthy();
  });

  it("asks visitors to sign in instead of offering votes", () => {
    render(<MvpVote week={week()} signedIn={false} />);
    expect(screen.getByRole("link", { name: "Sign in to vote" }).getAttribute("href")).toBe("/login?redirect=/offseason");
    expect(screen.queryByRole("button")).toBeNull();
  });
});
