import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DEFAULT_BANGER_BOARD_SETTINGS } from "@/lib/bangers/settings";
import type { BangerPost } from "@/lib/bangers/feed";

vi.mock("@/lib/bangers/actions", () => ({
  voteBangerPost: vi.fn(),
  voteDailyBanger: vi.fn(),
}));

import BangerBoard from "./BangerBoard";

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
});
