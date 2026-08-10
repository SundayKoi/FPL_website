import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player, Profile, Team } from "@/lib/draft/types";
import TeamEditor from "./TeamEditor";

const { from, rpc } = vi.hoisted(() => ({
  from: vi.fn(),
  rpc: vi.fn().mockResolvedValue({ error: null }),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from, rpc }),
}));

const chain = {
  select: vi.fn(),
  eq: vi.fn(),
  order: vi.fn(),
  limit: vi.fn(),
  insert: vi.fn(),
  update: vi.fn(),
  delete: vi.fn(),
};

Object.values(chain).forEach((method) => method.mockReturnValue(chain));
from.mockReturnValue(chain);

const team: Team = {
  id: "team-a",
  draft_id: "draft-1",
  name: "Team A",
  captain_profile_id: null,
  nomination_position: 1,
  budget_start: 100,
  points_remaining: 100,
};

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
    id: "top-1",
    draft_id: "draft-1",
    display_name: "Top One",
    role: "top",
    rank: null,
    opgg_url: null,
    notes: null,
    team_id: "team-a",
    price: 0,
    acquisition: "captain",
  },
];

const onChanged = vi.fn();
const props = {
  draftId: "draft-1",
  teams: [team],
  players,
  profiles: [] as Profile[],
  onChanged,
};

afterEach(() => {
  cleanup();
  from.mockClear();
  rpc.mockClear();
  rpc.mockResolvedValue({ error: null });
  onChanged.mockClear();
  Object.values(chain).forEach((method) => method.mockClear());
  vi.restoreAllMocks();
});

describe("TeamEditor", () => {
  it("offers an eligible existing pool player with a point value field", () => {
    render(<TeamEditor {...props} />);

    expect(screen.getByRole("option", { name: "Mid One · mid" })).toBeTruthy();
    expect(screen.getByLabelText("Point value")).toBeTruthy();
    expect(screen.getByPlaceholderText("Player name")).toBeTruthy();
    expect(screen.getByRole("button", { name: "Add" })).toBeTruthy();
  });

  it("assigns the selected existing player at the entered point value", async () => {
    render(<TeamEditor {...props} />);

    fireEvent.change(screen.getByLabelText("Existing player"), { target: { value: "mid-1" } });
    fireEvent.change(screen.getByLabelText("Point value"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add existing player" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_assign_setup_player", {
        p_draft_id: "draft-1",
        p_player_id: "mid-1",
        p_team_id: "team-a",
        p_price: 12,
      })
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("retains the existing-player selection and price when the RPC fails", async () => {
    rpc.mockResolvedValue({ error: { message: "ROLE_FILLED: already filled" } });
    render(<TeamEditor {...props} />);

    fireEvent.change(screen.getByLabelText("Existing player"), { target: { value: "mid-1" } });
    fireEvent.change(screen.getByLabelText("Point value"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add existing player" }));

    await screen.findByText("ROLE_FILLED: already filled");
    expect((screen.getByLabelText("Existing player") as HTMLSelectElement).value).toBe("mid-1");
    expect((screen.getByLabelText("Point value") as HTMLInputElement).value).toBe("12");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("changes a setup budget through the authoritative RPC", async () => {
    render(<TeamEditor {...props} />);

    fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "120" } });

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_set_setup_team_budget", {
        p_draft_id: "draft-1",
        p_team_id: "team-a",
        p_budget: 120,
      })
    );
  });

  it("removes a setup player through the origin-aware RPC", async () => {
    render(
      <TeamEditor
        {...props}
        players={[
          { ...players[0], team_id: "team-a", price: 12, acquisition: "free_agency" },
        ]}
      />
    );

    fireEvent.click(screen.getByRole("button", { name: "Remove" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_remove_setup_player", {
        p_draft_id: "draft-1",
        p_player_id: "mid-1",
      })
    );
  });

  it("removes a setup team through the origin-aware RPC", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<TeamEditor {...props} />);

    fireEvent.click(screen.getByRole("button", { name: "Remove team" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_remove_setup_team", {
        p_draft_id: "draft-1",
        p_team_id: "team-a",
      })
    );
  });

  it("excludes available players whose role is already prefilled", () => {
    render(
      <TeamEditor
        {...props}
        players={[
          ...players,
          { ...players[1], id: "top-available", display_name: "Another Top", team_id: null, price: null, acquisition: null },
        ]}
      />
    );

    expect(screen.queryByRole("option", { name: "Another Top · top" })).toBeNull();
  });

  it("does not offer either prefill form when a team already has two prefills", () => {
    render(
      <TeamEditor
        {...props}
        players={[
          ...players,
          { ...players[0], id: "jungle-1", display_name: "Jungle One", role: "jungle", team_id: "team-a", price: 0, acquisition: "captain" },
        ]}
      />
    );

    expect(screen.queryByLabelText("Existing player")).toBeNull();
    expect(screen.queryByPlaceholderText("Player name")).toBeNull();
  });
});
