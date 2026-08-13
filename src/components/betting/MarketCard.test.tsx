import { afterEach, describe, it, expect } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import { MarketCard } from "./MarketCard";
import type { MarketCardData } from "@/lib/betting/types";

afterEach(() => {
  cleanup();
});

const teamA = { id: 1, name: "New Origins", short_code: "NOA", color: "#3b82f6", logo_url: null };
const teamB = { id: 2, name: "DoV Twisted", short_code: "DOVT", color: "#ef4444", logo_url: null };

function market(overrides: Partial<MarketCardData> = {}): MarketCardData {
  return {
    id: 7,
    title: null,
    status: "OPEN",
    game_at: new Date(Date.now() + 3_600_000).toISOString(),
    lock_at: new Date(Date.now() + 3_000_000).toISOString(),
    team_a: teamA,
    team_b: teamB,
    pool_a: 4970,
    pool_b: 3010,
    pool_draw: 0,
    draw_enabled: false,
    open_line_prob_a: null,
    event_name: "Week 1",
    ...overrides,
  };
}

describe("MarketCard", () => {
  it("shows both team names and total volume", () => {
    render(<MarketCard market={market()} />);
    expect(screen.getByText("New Origins")).toBeTruthy();
    expect(screen.getByText("DoV Twisted")).toBeTruthy();
    expect(screen.getByText(/7,980/)).toBeTruthy(); // 4970 + 3010
  });

  it("links to the market detail page", () => {
    render(<MarketCard market={market()} />);
    expect(screen.getByRole("link").getAttribute("href")).toBe("/betting/market/7");
  });

  it("shows the market status", () => {
    render(<MarketCard market={market({ status: "LOCKED" })} />);
    expect(screen.getByText(/locked/i)).toBeTruthy();
  });
});
