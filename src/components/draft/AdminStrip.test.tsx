import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft, Lot, Player, Team } from "@/lib/draft/types";
import AdminStrip from "./AdminStrip";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc, from: vi.fn() }) }));

const draft: Draft = {
  id: "d1", name: "Draft", status: "live", countdown_seconds: 30,
  round_minimums: [10, 5, 1], current_round: 1, current_nominator_team_id: "t1",
  paused_time_remaining: null, created_at: "2026-08-14T00:00:00Z",
};

const teams: Team[] = [{
  id: "t1", draft_id: "d1", name: "Alpha", captain_profile_id: null, abbreviation: "AL",
  image_url: null, banner_color: null, division: null, nomination_position: 1,
  budget_start: 100, points_remaining: 50,
}];

// Two sold lots whose sale_action_sequence order DISAGREES with their
// closed_at/created_at order, so a component that sorted by the wrong key
// would pick lot-1 (later closed_at) instead of lot-2 (higher sequence,
// the one the server actually undoes) and name the wrong cascaded player.
const lots: Lot[] = [
  {
    id: "lot-1", draft_id: "d1", player_id: "p3", nominated_by_team_id: "t1", round: 1,
    opening_bid: 5, current_bid: 6, leading_team_id: "t1",
    closes_at: "2026-08-14T00:00:15Z", status: "sold", created_at: "2026-08-14T00:00:00Z",
    closed_at: "2026-08-14T00:00:25Z", sale_action_sequence: 3,
  },
  {
    id: "lot-2", draft_id: "d1", player_id: "p1", nominated_by_team_id: "t1", round: 1,
    opening_bid: 10, current_bid: 12, leading_team_id: "t1",
    closes_at: "2026-08-14T00:00:10Z", status: "sold", created_at: "2026-08-14T00:00:00Z",
    closed_at: "2026-08-14T00:00:05Z", sale_action_sequence: 5,
  },
];

const players: Player[] = [
  { id: "p1", draft_id: "d1", display_name: "Mid One", role: "mid", rank: null, opgg_url: null,
    notes: null, team_id: "t1", price: 12, acquisition: "auction", auto_assigned_from_lot_id: null },
  { id: "p2", draft_id: "d1", display_name: "Jungle Two", role: "jungle", rank: null, opgg_url: null,
    notes: null, team_id: "t1", price: 1, acquisition: "auction", auto_assigned_from_lot_id: "lot-2" },
  { id: "p3", draft_id: "d1", display_name: "Support Three", role: "support", rank: null, opgg_url: null,
    notes: null, team_id: "t1", price: 1, acquisition: "auction", auto_assigned_from_lot_id: "lot-1" },
];

const onError = vi.fn();
const props = { draft, teams, players, lots, openLot: null, onError };

afterEach(() => {
  cleanup();
  rpc.mockClear();
  onError.mockClear();
  vi.restoreAllMocks();
});

describe("AdminStrip undo", () => {
  it("names the auto-assigned players the undo will also return", async () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminStrip {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Undo last sale" }));

    expect(confirmSpy.mock.calls[0][0]).toContain("Jungle Two");
    expect(confirmSpy.mock.calls[0][0]).not.toContain("Support Three");
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("undo_last_sale", { p_draft_id: "d1" }));
  });

  it("keeps the plain prompt when the sale forced nothing", () => {
    const confirmSpy = vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminStrip {...props} players={[players[0]]} />);

    fireEvent.click(screen.getByRole("button", { name: "Undo last sale" }));

    expect(confirmSpy.mock.calls[0][0]).not.toContain("also");
    expect(rpc).not.toHaveBeenCalled();
  });
});
