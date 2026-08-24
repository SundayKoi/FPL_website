import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BANGER_BOARD_SETTINGS } from "@/lib/bangers/settings";
import type { BangerPost } from "@/lib/bangers/feed";

const { voteBangerPost, voteDailyBanger } = vi.hoisted(() => ({
  voteBangerPost: vi.fn(),
  voteDailyBanger: vi.fn(),
}));

vi.mock("@/lib/bangers/actions", () => ({
  voteBangerPost,
  voteDailyBanger,
}));

import BangerBoard from "./BangerBoard";

beforeEach(() => {
  voteBangerPost.mockReset();
  voteDailyBanger.mockReset();
});

afterEach(cleanup);

const post: BangerPost = {
  id: "post-1",
  text: "A saved vote",
  publishedAt: "2026-08-22T12:00:00.000Z",
  bangerVotes: 1,
  midVotes: 0,
  stinkerVotes: 0,
  url: "https://x.com/Stuart69Davis/status/post-1",
};

describe("BangerBoard saved votes", () => {
  it("renders the viewer's saved vote as selected after hydration", () => {
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={null}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
        initialVotes={{ "post-1": "banger" }}
        initialDailyVote={undefined}
      />,
    );

    const bangerButtons = screen.getAllByRole("button", { name: /Banger/ });
    expect(bangerButtons.filter((button) => button.getAttribute("aria-pressed") === "true")).toHaveLength(2);
  });

  it("renders the saved daily vote checkmark after a refresh", () => {
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={{ ...post, checkDate: "2026-08-24", startsAt: "2026-08-24T00:00:00.000Z", endsAt: "2026-08-25T00:00:00.000Z" }}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
        initialDailyVote="mid"
      />,
    );

    expect(screen.getByText("✓ Bonus claimed")).toBeTruthy();
  });

  it("renders the daily tweet's banger meter", () => {
    render(
      <BangerBoard
        posts={[]}
        dailyBanger={{ ...post, bangerVotes: 7, midVotes: 2, stinkerVotes: 1, checkDate: "2026-08-24", startsAt: "2026-08-24T00:00:00.000Z", endsAt: "2026-08-25T00:00:00.000Z" }}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
      />,
    );

    expect(screen.getByRole("meter", { name: /70% Banger/i })).toBeTruthy();
  });

  it("hydrates the recent card from a saved daily vote when the tweet overlaps", () => {
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={{ ...post, checkDate: "2026-08-24", startsAt: "2026-08-24T00:00:00.000Z", endsAt: "2026-08-25T00:00:00.000Z" }}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
        initialDailyVote="stinker"
      />,
    );

    const voteGroups = screen.getAllByRole("group", { name: "Vote on A saved vote" });
    expect(voteGroups.length).toBeGreaterThanOrEqual(2);
    for (const group of voteGroups.slice(0, 2)) {
      expect(group.querySelector("button[aria-pressed='true']")?.textContent).toContain("Stinker");
    }
    expect(Array.from(voteGroups[1].querySelectorAll("button")).every((button) => button.disabled)).toBe(true);
    expect(screen.getAllByRole("meter", { name: "50% Mid" }).length).toBeGreaterThanOrEqual(2);
  });
});

describe("BangerBoard vote feedback", () => {
  it("shares a daily vote with the overlapping recent card", async () => {
    voteDailyBanger.mockResolvedValue({ ok: true, alreadyVoted: false });
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={{ ...post, checkDate: "2026-08-24", startsAt: "2026-08-24T00:00:00.000Z", endsAt: "2026-08-25T00:00:00.000Z" }}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
      />,
    );

    const voteGroups = screen.getAllByRole("group", { name: "Vote on A saved vote" });
    fireEvent.click(voteGroups[0].querySelectorAll("button")[2]);
    await waitFor(() => expect(screen.getByText("Vote locked in — $200 added to your wallet.")).toBeTruthy());

    expect(voteGroups[1].querySelector("button[aria-pressed='true']")?.textContent ?? "").toContain("Banger");
  });

  it("shares a recent vote with the overlapping daily card", async () => {
    voteBangerPost.mockResolvedValue({ ok: true });
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={{ ...post, checkDate: "2026-08-24", startsAt: "2026-08-24T00:00:00.000Z", endsAt: "2026-08-25T00:00:00.000Z" }}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
      />,
    );

    const voteGroups = screen.getAllByRole("group", { name: "Vote on A saved vote" });
    fireEvent.click(voteGroups[1].querySelectorAll("button")[2]);
    await waitFor(() => expect(screen.getAllByText("Vote saved.").length).toBeGreaterThan(0));

    expect(voteGroups[0].querySelector("button[aria-pressed='true']")?.textContent ?? "").toContain("Banger");
  });

  it("shows the aggregate community verdict", () => {
    render(
      <BangerBoard
        posts={[{ ...post, bangerVotes: 2, stinkerVotes: 2 }]}
        dailyBanger={null}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
      />,
    );

    expect(screen.getAllByRole("meter", { name: "50% Mid" }).length).toBeGreaterThan(0);
    expect(screen.getByText("4 votes cast")).toBeTruthy();
  });

  it("does not invent unavailable engagement counts", () => {
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={null}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
      />,
    );

    expect(screen.queryByLabelText("Tweet engagement")).toBeNull();
  });

  it("disables a post's vote controls while its vote is being saved", async () => {
    let resolveVote: ((result: { ok: true }) => void) | undefined;
    voteBangerPost.mockImplementation(() => new Promise((resolve) => { resolveVote = resolve; }));
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={null}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
      />,
    );

    const voteGroup = screen.getAllByRole("group", { name: "Vote on A saved vote" })[0];
    fireEvent.click(screen.getAllByRole("button", { name: /Stinker/ })[0]);

    await waitFor(() => {
      for (const button of Array.from(voteGroup.querySelectorAll("button"))) {
        expect(button.disabled).toBe(true);
      }
    });
    resolveVote?.({ ok: true });
    await waitFor(() => expect(screen.getAllByText("Vote saved.").length).toBeGreaterThan(0));
  });

  it("rolls back a rejected vote and shows the returned error", async () => {
    voteBangerPost.mockResolvedValue({ ok: false, error: "Sign in to rate tweets." });
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={null}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
      />,
    );

    const stinkerButton = screen.getAllByRole("button", { name: /Stinker/ })[0];
    fireEvent.click(stinkerButton);

    await waitFor(() => expect(screen.getAllByText("Sign in to rate tweets.").length).toBeGreaterThan(0));
    expect(stinkerButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("rolls back a thrown vote failure and shows a safe error", async () => {
    voteBangerPost.mockRejectedValue(new Error("network unavailable"));
    render(
      <BangerBoard
        posts={[post]}
        dailyBanger={null}
        settings={DEFAULT_BANGER_BOARD_SETTINGS}
      />,
    );

    const midButton = screen.getAllByRole("button", { name: /Mid/ })[0];
    fireEvent.click(midButton);

    await waitFor(() => expect(screen.getAllByText("That vote could not be saved.").length).toBeGreaterThan(0));
    expect(midButton.getAttribute("aria-pressed")).toBe("false");
  });
});
