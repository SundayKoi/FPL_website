import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import PremiumHub from "./PremiumHub";

afterEach(() => cleanup());

const snapshot = {
  league: "premier" as const,
  cards: { status: "empty" as const, message: "No rated cards are available yet." },
  betting: {
    status: "ready" as const,
    data: {
      balance: 1250,
      event: {
        id: 1,
        name: "Friday Night",
        description: null,
        open_markets: 1,
        locked_markets: 0,
        has_live_pickem: false,
        next_lock_at: null,
      },
      market: {
        id: 7,
        title: null,
        status: "OPEN" as const,
        game_at: "2030-01-01T01:00:00Z",
        lock_at: "2030-01-01T00:55:00Z",
        team_a: { id: 1, name: "New Origins", short_code: "NOA", color: "#3b82f6", logo_url: null },
        team_b: { id: 2, name: "DoV Twisted", short_code: "DOVT", color: "#ef4444", logo_url: null },
        pool_a: 4970,
        pool_b: 3010,
        pool_draw: 0,
        draw_enabled: false,
        open_line_prob_a: null,
        event_name: "Friday Night",
      },
    },
  },
  banger: { status: "empty" as const, message: "The next take is warming up." },
};

describe("PremiumHub betting preview", () => {
  it("shows a live bettable game and the member wallet", () => {
    render(<PremiumHub snapshot={snapshot} />);

    expect(screen.getByText("New Origins")).toBeTruthy();
    expect(screen.getByText("DoV Twisted")).toBeTruthy();
    expect(screen.getByText("Betting open")).toBeTruthy();
    expect(screen.getByText("$7,980 pool")).toBeTruthy();
    expect(screen.getByText("$1,250")).toBeTruthy();
    expect(screen.getByText("Rate the latest take and vote once a day for $200.")).toBeTruthy();
  });

  it("shows an explicit empty state when no market is available", () => {
    render(
      <PremiumHub
        snapshot={{
          ...snapshot,
          betting: { ...snapshot.betting, data: { ...snapshot.betting.data, market: null } },
        }}
      />,
    );

    expect(screen.getByText("No bettable games are open right now.")).toBeTruthy();
  });
});
