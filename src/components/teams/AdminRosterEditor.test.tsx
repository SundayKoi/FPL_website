import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player, Profile, Team } from "@/lib/draft/types";
import AdminRosterEditor from "./AdminRosterEditor";

const { rpc, refresh } = vi.hoisted(() => ({
  rpc: vi.fn().mockResolvedValue({ error: null }),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const teams: Team[] = [
  {
    id: "team-a",
    draft_id: "draft-1",
    name: "Team A",
    abbreviation: "TA",
    image_url: null,
    banner_color: "#083344",
    captain_profile_id: "profile-a",
    nomination_position: 1,
    budget_start: 100,
    points_remaining: 75,
  },
  {
    id: "team-b",
    draft_id: "draft-1",
    name: "Team B",
    abbreviation: "TB",
    image_url: null,
    banner_color: "#450a0a",
    captain_profile_id: "profile-b",
    nomination_position: 2,
    budget_start: 100,
    points_remaining: 82,
  },
];

const players: Player[] = [
  {
    id: "captain-a",
    draft_id: "draft-1",
    display_name: "Captain A",
    role: "top",
    rank: null,
    opgg_url: null,
    notes: null,
    team_id: "team-a",
    price: 0,
    acquisition: "captain",
  },
  {
    id: "mid-a",
    draft_id: "draft-1",
    display_name: "Mid A",
    role: "mid",
    rank: null,
    opgg_url: null,
    notes: null,
    team_id: "team-a",
    price: 12,
    acquisition: "auction",
  },
  {
    id: "captain-b",
    draft_id: "draft-1",
    display_name: "Captain B",
    role: "top",
    rank: null,
    opgg_url: null,
    notes: null,
    team_id: "team-b",
    price: 0,
    acquisition: "captain",
  },
  {
    id: "mid-b",
    draft_id: "draft-1",
    display_name: "Mid B",
    role: "mid",
    rank: null,
    opgg_url: null,
    notes: null,
    team_id: "team-b",
    price: 18,
    acquisition: "auction",
  },
  {
    id: "support-b",
    draft_id: "draft-1",
    display_name: "Support B",
    role: "support",
    rank: null,
    opgg_url: null,
    notes: null,
    team_id: "team-b",
    price: 9,
    acquisition: "auction",
  },
];

const profiles: Profile[] = [
  {
    id: "profile-a",
    discord_id: null,
    display_name: "Selected Captain A",
    avatar_url: null,
    is_admin: false,
  },
  {
    id: "profile-b",
    discord_id: null,
    display_name: "Selected Captain B",
    avatar_url: null,
    is_admin: false,
  },
];

afterEach(() => {
  cleanup();
  rpc.mockClear();
  rpc.mockResolvedValue({ error: null });
  refresh.mockClear();
});

describe("AdminRosterEditor", () => {
  it("keeps captain rows locked", () => {
    render(<AdminRosterEditor draftId="draft-1" teams={teams} players={players} profiles={profiles} />);

    const captainRow = screen.getByText("Captain A").closest("li")!;
    expect(captainRow.getAttribute("draggable")).toBe("false");
    expect(within(captainRow).getByLabelText("Captain, cannot be traded")).toBeTruthy();
  });

  it("swaps same-role players through the RPC", async () => {
    render(<AdminRosterEditor draftId="draft-1" teams={teams} players={players} profiles={profiles} />);

    const source = screen.getByText("Mid A").closest("li")!;
    const target = screen.getByText("Mid B").closest("li")!;
    fireEvent.dragStart(source);
    fireEvent.drop(target);

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("swap_roster_players", {
        p_left_player_id: "mid-a",
        p_right_player_id: "mid-b",
      });
      expect(refresh).toHaveBeenCalled();
    });
  });

  it("rejects a different-position drop without calling the RPC", async () => {
    render(<AdminRosterEditor draftId="draft-1" teams={teams} players={players} profiles={profiles} />);

    fireEvent.dragStart(screen.getByText("Mid A").closest("li")!);
    fireEvent.drop(screen.getByText("Support B").closest("li")!);

    expect(rpc).not.toHaveBeenCalled();
    expect((await screen.findByRole("status")).textContent).toMatch(/same position/i);
  });

  it("offers only same-position destinations from the keyboard action", async () => {
    render(<AdminRosterEditor draftId="draft-1" teams={teams} players={players} profiles={profiles} />);

    fireEvent.click(screen.getByRole("button", { name: "Swap with Mid A" }));
    const dialog = await screen.findByRole("dialog", { name: /swap mid a/i });
    expect(within(dialog).getByRole("button", { name: /Mid B/ })).toBeTruthy();
    expect(within(dialog).queryByRole("button", { name: /Support B/ })).toBeNull();
    expect(within(dialog).queryByRole("button", { name: /Captain B/ })).toBeNull();
  });

  it("uses the selected captain profile name on normal admin roster cards", () => {
    render(<AdminRosterEditor draftId="draft-1" teams={teams} players={players} profiles={profiles} />);

    expect(screen.getByText("Captain Selected Captain A")).toBeTruthy();
    expect(screen.queryByText("Captain Captain A")).toBeNull();
  });
});
