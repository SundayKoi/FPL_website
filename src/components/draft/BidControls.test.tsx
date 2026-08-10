import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import BidControls from "./BidControls";

const rpc = vi.fn().mockResolvedValue({ error: null });

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

const team = { id: "team-1", name: "Team 1", points_remaining: 30 } as never;
const lot = { id: "lot-1", current_bid: 10, status: "open", leading_team_id: "team-2" } as never;
const player = { id: "player-1", display_name: "Player 1", role: "top" } as never;

describe("BidControls", () => {
  it("submits the custom bid amount when the bid form is submitted", async () => {
    render(<BidControls team={team} lot={lot} lotPlayer={player} players={[]} onError={vi.fn()} />);

    const input = screen.getByRole("spinbutton");
    fireEvent.change(input, { target: { value: "25" } });
    fireEvent.submit(input.closest("form")!);

    await waitFor(() => expect(rpc).toHaveBeenCalledWith("place_bid", {
      p_lot_id: "lot-1",
      p_amount: 25,
    }));
  });
});
