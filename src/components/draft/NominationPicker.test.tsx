import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft, Player, Team } from "@/lib/draft/types";
import NominationPicker from "./NominationPicker";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const draft: Draft = {
  id: "d1", name: "Draft", status: "live", countdown_seconds: 30,
  round_minimums: [10, 5, 1], current_round: 1, current_nominator_team_id: "t1",
  paused_time_remaining: null, created_at: "2026-08-17T00:00:00Z",
};

// 60 points with three roles open (jungle/mid/adc are open, top+support held),
// so the cap is 60 - 2 = 58.
const team: Team = {
  id: "t1", draft_id: "d1", name: "Alpha", captain_profile_id: "me", abbreviation: "AL",
  image_url: null, banner_color: null, division: null, nomination_position: 1,
  budget_start: 100, points_remaining: 60,
};

const player = (over: Partial<Player>): Player => ({
  id: "p", draft_id: "d1", display_name: "P", role: "mid", rank: null, opgg_url: null,
  notes: null, team_id: null, price: null, acquisition: null, ...over,
});

const players: Player[] = [
  player({ id: "own-top", display_name: "Held Top", role: "top", team_id: "t1", price: 0, acquisition: "captain" }),
  player({ id: "own-sup", display_name: "Held Sup", role: "support", team_id: "t1", price: 0, acquisition: "free_agency" }),
  player({ id: "free-mid", display_name: "Free Mid", role: "mid" }),
];

const onError = vi.fn();
const props = { team, draft, players, onError };

const openDialogFor = (name: string) => {
  fireEvent.click(screen.getByText(name));
};

afterEach(() => {
  cleanup();
  rpc.mockClear();
  rpc.mockResolvedValue({ error: null });
  onError.mockClear();
});

describe("NominationPicker opening bid", () => {
  it("defaults the opening bid to the round minimum and shows the range", () => {
    render(<NominationPicker {...props} />);
    openDialogFor("Free Mid");

    expect((screen.getByLabelText("Opening bid") as HTMLInputElement).value).toBe("10");
    expect(screen.getByText(/minimum 10 · your max 58/)).toBeTruthy();
  });

  it("nominates at the raised amount", async () => {
    render(<NominationPicker {...props} />);
    openDialogFor("Free Mid");

    fireEvent.change(screen.getByLabelText("Opening bid"), { target: { value: "30" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("nominate", {
        p_draft_id: "d1",
        p_player_id: "free-mid",
        p_opening_bid: 30,
      })
    );
  });

  it("refuses an amount below the round minimum without calling the RPC", () => {
    render(<NominationPicker {...props} />);
    openDialogFor("Free Mid");

    fireEvent.change(screen.getByLabelText("Opening bid"), { target: { value: "9" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate" }));

    expect(onError).toHaveBeenCalledWith("Round 1 opens at 10 or more");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses an amount above the team's max", () => {
    render(<NominationPicker {...props} />);
    openDialogFor("Free Mid");

    fireEvent.change(screen.getByLabelText("Opening bid"), { target: { value: "59" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate" }));

    expect(onError).toHaveBeenCalledWith("Your max is 58");
    expect(rpc).not.toHaveBeenCalled();
  });

  it("refuses a non-numeric amount", () => {
    render(<NominationPicker {...props} />);
    openDialogFor("Free Mid");

    fireEvent.change(screen.getByLabelText("Opening bid"), { target: { value: "" } });
    fireEvent.click(screen.getByRole("button", { name: "Nominate" }));

    expect(onError).toHaveBeenCalledWith("Enter a whole number of points");
    expect(rpc).not.toHaveBeenCalled();
  });
});
