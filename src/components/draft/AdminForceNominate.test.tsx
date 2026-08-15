import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft, Player, Team } from "@/lib/draft/types";
import AdminForceNominate from "./AdminForceNominate";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const draft: Draft = {
  id: "d1", name: "Draft", status: "live", countdown_seconds: 30,
  round_minimums: [10, 5, 1], current_round: 1, current_nominator_team_id: "t1",
  paused_time_remaining: null, created_at: "2026-08-15T00:00:00Z",
};

const nominatorTeam: Team = {
  id: "t1", draft_id: "d1", name: "Alpha", captain_profile_id: null, abbreviation: "AL",
  captain_profile_id_2: null, image_url: null, banner_color: null, division: null, nomination_position: 1,
  budget_start: 100, points_remaining: 60,
};

const player = (over: Partial<Player>): Player => ({
  id: "p", draft_id: "d1", display_name: "P", role: "mid", rank: null, opgg_url: null,
  notes: null, team_id: null, price: null, acquisition: null, ...over,
});

// Alpha already holds a top, so top players must not be offered.
const players: Player[] = [
  player({ id: "own-top", display_name: "Their Top", role: "top", team_id: "t1", price: 0, acquisition: "captain" }),
  player({ id: "free-mid", display_name: "Free Mid", role: "mid" }),
  player({ id: "free-top", display_name: "Free Top", role: "top" }),
  player({ id: "taken-adc", display_name: "Taken Adc", role: "adc", team_id: "t2", price: 5, acquisition: "auction" }),
];

const onError = vi.fn();
const props = { draft, nominatorTeam, players, onError };

afterEach(() => {
  cleanup();
  rpc.mockClear();
  rpc.mockResolvedValue({ error: null });
  onError.mockClear();
  vi.restoreAllMocks();
});

describe("AdminForceNominate", () => {
  it("offers only unrostered players in a role the nominator still needs", () => {
    render(<AdminForceNominate {...props} />);

    expect(screen.getByRole("option", { name: "Free Mid · mid" })).toBeTruthy();
    // Alpha's top slot is filled, so no top may be nominated for them.
    expect(screen.queryByRole("option", { name: "Free Top · top" })).toBeNull();
    // And a player already on another team is unavailable entirely.
    expect(screen.queryByRole("option", { name: "Taken Adc · adc" })).toBeNull();
  });

  it("nominates for the team on the clock, behind a confirmation", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminForceNominate {...props} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "free-mid" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate for Alpha" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_nominate", {
        p_draft_id: "d1",
        p_player_id: "free-mid",
        // Blank field means the round minimum, which the RPC resolves itself.
        p_opening_bid: null,
      })
    );
  });

  it("forces a nomination above the round minimum when an amount is given", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminForceNominate {...props} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "free-mid" } });
    fireEvent.change(screen.getByLabelText("Opening bid"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate for Alpha" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_nominate", {
        p_draft_id: "d1",
        p_player_id: "free-mid",
        p_opening_bid: 30,
      })
    );
  });

  it("rejects a non-numeric amount before calling the RPC", () => {
    render(<AdminForceNominate {...props} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "free-mid" } });
    fireEvent.change(screen.getByLabelText("Opening bid"), { target: { value: "lots" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate for Alpha" }));

    expect(onError).toHaveBeenCalledWith(
      "Enter a whole number of points, or leave it blank for the minimum"
    );
    expect(rpc).not.toHaveBeenCalled();
  });

  it("does nothing when the confirmation is declined", () => {
    vi.spyOn(window, "confirm").mockReturnValue(false);
    render(<AdminForceNominate {...props} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "free-mid" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate for Alpha" }));

    expect(rpc).not.toHaveBeenCalled();
  });

  it("reports a rejected nomination with the error code stripped", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rpc.mockResolvedValue({ error: { message: "LOT_OPEN_EXISTS: an auction is already running" } });
    render(<AdminForceNominate {...props} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "free-mid" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate for Alpha" }));

    await waitFor(() =>
      expect(onError).toHaveBeenCalledWith("an auction is already running")
    );
  });
});
