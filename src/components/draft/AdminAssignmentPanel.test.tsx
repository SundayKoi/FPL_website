import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Draft, Player, Team } from "@/lib/draft/types";
import AdminAssignmentPanel from "./AdminAssignmentPanel";

const { rpc } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

const draft: Draft = {
  id: "draft-1",
  name: "Summer Draft",
  status: "live",
  countdown_seconds: 30,
  round_minimums: [1],
  current_round: 1,
  current_nominator_team_id: null,
  paused_time_remaining: null,
  created_at: "2026-08-10T00:00:00.000Z",
};

const teams: Team[] = [
  {
    id: "team-a",
    draft_id: "draft-1",
    name: "Team A",
    abbreviation: "TA",
    image_url: null,
    captain_profile_id: "profile-a",
    nomination_position: 1,
    budget_start: 100,
    points_remaining: 100,
  },
  {
    id: "team-b",
    draft_id: "draft-1",
    name: "Team B",
    abbreviation: "TB",
    image_url: null,
    captain_profile_id: "profile-b",
    nomination_position: 2,
    budget_start: 100,
    points_remaining: 100,
  },
];

const players: Player[] = [
  {
    id: "mid-1",
    draft_id: "draft-1",
    display_name: "Mid One",
    role: "mid",
    rank: null,
    opgg_url: null,
    notes: null,
    team_id: null,
    price: null,
    acquisition: null,
  },
  {
    id: "sold-mid",
    draft_id: "draft-1",
    display_name: "Sold Mid",
    role: "mid",
    rank: null,
    opgg_url: null,
    notes: null,
    team_id: "team-b",
    price: 8,
    acquisition: "auction",
  },
];

const onError = vi.fn();
const props = { draft, teams, players, openLot: null, onError };

afterEach(() => {
  cleanup();
  rpc.mockClear();
  rpc.mockResolvedValue({ error: null });
  onError.mockClear();
  vi.restoreAllMocks();
});

describe("AdminAssignmentPanel", () => {
  it("hides the assignment panel while an auction is open", () => {
    render(<AdminAssignmentPanel {...props} openLot={{ id: "lot-1", status: "open" } as never} />);

    expect(screen.queryByRole("heading", { name: /direct assignment/i })).toBeNull();
  });

  it("offers only available players and teams with the selected role open", () => {
    render(<AdminAssignmentPanel {...props} openLot={null} />);

    expect(screen.getByRole("option", { name: "Mid One" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Sold Mid" })).toBeNull();
    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "mid-1" } });
    expect(screen.getByRole("option", { name: "Team A" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Team B" })).toBeNull();
  });

  it("submits the selected player, team, and price", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminAssignmentPanel {...props} openLot={null} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "mid-1" } });
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "team-a" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: /assign player/i }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_assign_player", {
        p_draft_id: "draft-1",
        p_player_id: "mid-1",
        p_team_id: "team-a",
        p_price: 12,
      })
    );
  });

  it("reports returned RPC errors with a friendly message", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    rpc.mockResolvedValue({ error: { message: "PLAYER_TAKEN: already assigned" } });
    render(<AdminAssignmentPanel {...props} openLot={null} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "mid-1" } });
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "team-a" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: /assign player/i }));

    await waitFor(() => expect(onError).toHaveBeenCalledWith("That player is already taken."));
  });

  it("does not call the RPC for an invalid local selection", () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminAssignmentPanel {...props} openLot={null} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "mid-1" } });
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "team-a" } });
    fireEvent.change(screen.getByLabelText("Price"), { target: { value: "-1" } });
    fireEvent.click(screen.getByRole("button", { name: /assign player/i }));

    expect(rpc).not.toHaveBeenCalled();
  });

  it("does not confirm or call the RPC when price is blank", () => {
    const confirm = vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<AdminAssignmentPanel {...props} openLot={null} />);

    fireEvent.change(screen.getByLabelText("Player"), { target: { value: "mid-1" } });
    fireEvent.change(screen.getByLabelText("Team"), { target: { value: "team-a" } });
    fireEvent.click(screen.getByRole("button", { name: /assign player/i }));

    expect(confirm).not.toHaveBeenCalled();
    expect(rpc).not.toHaveBeenCalled();
  });
});
