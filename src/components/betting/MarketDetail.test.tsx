import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MarketDetailData } from "@/lib/betting/types";
import { useMarketDetail } from "@/hooks/useMarketDetail";
import { MarketDetail } from "./MarketDetail";

vi.mock("@/hooks/useMarketDetail", () => ({
  useMarketDetail: vi.fn(),
  fetchMyOpenBets: vi.fn(async () => []),
}));
vi.mock("@/hooks/useIsLocked", () => ({ useIsLocked: () => false }));
vi.mock("@/lib/betting/actions", () => ({
  placeBet: vi.fn(),
  cashoutBet: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));

afterEach(cleanup);

const market: MarketDetailData = {
  id: 7,
  title: "Final",
  status: "OPEN",
  game_at: "2026-08-22T20:00:00.000Z",
  lock_at: "2026-08-22T20:00:00.000Z",
  team_a: { id: 1, name: "Alpha", short_code: "ALP", color: "#fff", logo_url: null },
  team_b: { id: 2, name: "Bravo", short_code: "BRV", color: "#aaa", logo_url: null },
  pool_a: 100,
  pool_b: 100,
  pool_draw: 0,
  draw_enabled: false,
  open_line_prob_a: null,
  event_name: "Finals",
  event_id: 3,
  rules: null,
  winning_team_id: null,
  drawn: false,
  top_bets: [],
};

describe("MarketDetail realtime recovery", () => {
  it("warns about interrupted odds updates and lets the viewer refresh them", () => {
    const refetch = vi.fn(async () => {});
    vi.mocked(useMarketDetail).mockReturnValue({
      market,
      connected: false,
      connectionStatus: "reconnecting",
      refetch,
    });

    render(<MarketDetail market={market} balance={500} loggedIn openBets={[]} />);

    expect(screen.getByRole("alert").textContent).toMatch(/live updates interrupted/i);
    fireEvent.click(screen.getByRole("button", { name: /retry now/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });
});
