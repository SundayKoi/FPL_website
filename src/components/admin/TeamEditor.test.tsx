import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
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
  captain_profile_id_2: null,
  abbreviation: "TA",
  image_url: null,
  banner_color: "#083344",
  division: null,
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
    id: "adc-1",
    draft_id: "draft-1",
    display_name: "Adc One",
    role: "adc",
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

const profiles: Profile[] = [
  {
    id: "profile-primary",
    display_name: "Primary",
    discord_id: null,
    avatar_url: null,
    is_admin: false,
  },
  {
    id: "profile-secondary",
    display_name: "Secondary",
    discord_id: null,
    avatar_url: null,
    is_admin: false,
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
  it("adds a derived abbreviation for a new team", async () => {
    render(<TeamEditor {...props} teams={[]} />);

    fireEvent.click(screen.getByRole("button", { name: "Add team" }));

    await waitFor(() =>
      expect(chain.insert).toHaveBeenCalledWith(
        expect.objectContaining({ abbreviation: "T1" })
      )
    );
  });

  it("offers an eligible existing pool player with a point value field", () => {
    render(<TeamEditor {...props} players={players.slice(0, 2)} />);

    expect(screen.getByRole("option", { name: "Mid One · mid" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Adc One · adc" })).toBeTruthy();
    expect(screen.getByLabelText("Point value")).toBeTruthy();
    expect(screen.queryByPlaceholderText("Player name")).toBeNull();
    expect(screen.queryByRole("button", { name: "Add" })).toBeNull();
    expect(screen.getByLabelText("Acquisition")).toBeTruthy();
    expect(screen.getByRole("option", { name: "Captain" })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Free Agency" })).toBeTruthy();
  });

  it("keeps point values out of the existing-player selector", () => {
    render(
      <TeamEditor
        {...props}
        players={[{ ...players[0], display_name: "Canny", role: "top" }]}
      />
    );

    expect(screen.getByRole("option", { name: "Canny · top" })).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Canny · top · 30 pts" })).toBeNull();
  });

  it("shows a pre-filled player's assigned point value after they are added", () => {
    render(
      <TeamEditor
        {...props}
        players={[
          {
            ...players[0],
            display_name: "Spies",
            role: "support",
            team_id: "team-a",
            price: 20,
            acquisition: "captain",
          },
        ]}
      />
    );

    expect(
      screen.getByText(
        (_, element) =>
          element?.tagName.toLowerCase() === "li" &&
          element.textContent?.includes("Spies · support · 20 pts") === true
      )
    ).toBeTruthy();
  });

  it("assigns the selected existing player as captain at the entered point value", async () => {
    render(<TeamEditor {...props} players={players.slice(0, 2)} />);

    fireEvent.change(screen.getByLabelText("Existing player"), { target: { value: "mid-1" } });
    fireEvent.change(screen.getByLabelText("Acquisition"), { target: { value: "captain" } });
    fireEvent.change(screen.getByLabelText("Point value"), { target: { value: "15" } });
    fireEvent.click(screen.getByRole("button", { name: "Add existing player" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_assign_setup_player", {
        p_draft_id: "draft-1",
        p_player_id: "mid-1",
        p_team_id: "team-a",
        p_price: 15,
        p_acquisition: "captain",
      })
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("assigns the selected existing player as free agency at the entered point value", async () => {
    render(<TeamEditor {...props} players={players.slice(0, 2)} />);

    fireEvent.change(screen.getByLabelText("Existing player"), { target: { value: "adc-1" } });
    fireEvent.change(screen.getByLabelText("Acquisition"), { target: { value: "free_agency" } });
    fireEvent.change(screen.getByLabelText("Point value"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add existing player" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_assign_setup_player", {
        p_draft_id: "draft-1",
        p_player_id: "adc-1",
        p_team_id: "team-a",
        p_price: 12,
        p_acquisition: "free_agency",
      })
    );
    expect(onChanged).toHaveBeenCalled();
  });

  it("retains the existing-player selection, acquisition, and price when the RPC fails", async () => {
    rpc.mockResolvedValue({ error: { message: "ROLE_FILLED: already filled" } });
    render(<TeamEditor {...props} players={players.slice(0, 2)} />);

    fireEvent.change(screen.getByLabelText("Existing player"), { target: { value: "mid-1" } });
    fireEvent.change(screen.getByLabelText("Acquisition"), { target: { value: "free_agency" } });
    fireEvent.change(screen.getByLabelText("Point value"), { target: { value: "12" } });
    fireEvent.click(screen.getByRole("button", { name: "Add existing player" }));

    await screen.findByText("ROLE_FILLED: already filled");
    expect((screen.getByLabelText("Existing player") as HTMLSelectElement).value).toBe("mid-1");
    expect((screen.getByLabelText("Acquisition") as HTMLSelectElement).value).toBe("free_agency");
    expect((screen.getByLabelText("Point value") as HTMLInputElement).value).toBe("12");
    expect(onChanged).not.toHaveBeenCalled();
  });

  it("only offers free agency when captain is already assigned", () => {
    render(<TeamEditor {...props} />);

    expect(screen.getByLabelText("Acquisition")).toBeTruthy();
    expect(screen.queryByRole("option", { name: "Captain" })).toBeNull();
    expect(screen.getByRole("option", { name: "Free Agency" })).toBeTruthy();
  });

  it("falls back to free agency when a refetch removes captain from the available acquisition types", () => {
    const { rerender } = render(<TeamEditor {...props} players={players.slice(0, 2)} />);

    fireEvent.change(screen.getByLabelText("Acquisition"), { target: { value: "captain" } });

    rerender(<TeamEditor {...props} />);

    expect((screen.getByLabelText("Acquisition") as HTMLSelectElement).value).toBe(
      "free_agency"
    );
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

  it("renders a second-captain selector that excludes the selected primary captain", () => {
    render(
      <TeamEditor
        {...props}
        teams={[{ ...team, captain_profile_id: "profile-primary" }]}
        profiles={profiles}
      />
    );

    const secondCaptainSelect = screen.getByLabelText("Second captain");
    expect(secondCaptainSelect).toBeTruthy();
    expect(within(secondCaptainSelect).queryByRole("option", { name: "Primary" })).toBeNull();
    expect(within(secondCaptainSelect).getByRole("option", { name: "Secondary" })).toBeTruthy();
  });

  it("renders a captain selector that excludes the selected second captain", () => {
    render(
      <TeamEditor
        {...props}
        teams={[{ ...team, captain_profile_id_2: "profile-secondary" }]}
        profiles={profiles}
      />
    );

    const captainSelect = screen.getByLabelText("Captain");
    expect(captainSelect).toBeTruthy();
    expect(within(captainSelect).getByRole("option", { name: "Primary" })).toBeTruthy();
    expect(within(captainSelect).queryByRole("option", { name: "Secondary" })).toBeNull();
  });

  it("assigns a second captain through the existing team update flow", async () => {
    render(
      <TeamEditor
        {...props}
        profiles={profiles}
      />
    );

    fireEvent.change(screen.getByLabelText("Second captain"), {
      target: { value: "profile-secondary" },
    });

    await waitFor(() =>
      expect(chain.update).toHaveBeenCalledWith({ captain_profile_id_2: "profile-secondary" })
    );
    expect(chain.eq).toHaveBeenCalledWith("id", "team-a");
    expect(onChanged).toHaveBeenCalled();
  });

  it("clears a second captain back to null", async () => {
    render(
      <TeamEditor
        {...props}
        teams={[{ ...team, captain_profile_id_2: "profile-secondary" }]}
        profiles={profiles}
      />
    );

    fireEvent.change(screen.getByLabelText("Second captain"), {
      target: { value: "" },
    });

    await waitFor(() => expect(chain.update).toHaveBeenCalledWith({ captain_profile_id_2: null }));
    expect(onChanged).toHaveBeenCalled();
  });

  it("shows and edits the remaining setup budget after prefilled spend", async () => {
    render(
      <TeamEditor
        {...props}
        teams={[{ ...team, budget_start: 100, points_remaining: 80 }]}
        players={[
          {
            ...players[0],
            team_id: "team-a",
            price: 20,
            acquisition: "captain",
          },
        ]}
      />
    );

    expect((screen.getByLabelText("Budget") as HTMLInputElement).value).toBe("80");

    fireEvent.change(screen.getByLabelText("Budget"), { target: { value: "90" } });

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("admin_set_setup_team_budget", {
        p_draft_id: "draft-1",
        p_team_id: "team-a",
        p_budget: 110,
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

  describe("nomination order", () => {
    const three: Team[] = [
      { ...team, id: "team-a", name: "Team A", nomination_position: 1 },
      { ...team, id: "team-b", name: "Team B", nomination_position: 2 },
      { ...team, id: "team-c", name: "Team C", nomination_position: 3 },
    ];

    it("replaces the typed position field with a drag handle", () => {
      render(<TeamEditor {...props} teams={three} />);

      expect(screen.queryByLabelText("Position")).toBeNull();
      expect(screen.getByLabelText("Drag Team A")).toBeTruthy();
      expect(screen.getByLabelText("Nomination position for Team B").textContent).toBe("2");
    });

    it("sends the whole new order when a team is dragged onto another slot", async () => {
      const { container } = render(<TeamEditor {...props} teams={three} />);
      const cards = container.querySelectorAll(".card-brand");

      fireEvent.dragStart(screen.getByLabelText("Drag Team C"), {
        dataTransfer: { setData: vi.fn(), effectAllowed: "" },
      });
      fireEvent.dragOver(cards[0]);
      fireEvent.drop(cards[0]);

      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith("admin_reorder_setup_teams", {
          p_draft_id: "draft-1",
          p_team_ids: ["team-c", "team-a", "team-b"],
        })
      );
      expect(onChanged).toHaveBeenCalled();
    });

    it("reorders from the keyboard-reachable move buttons too", async () => {
      render(<TeamEditor {...props} teams={three} />);

      fireEvent.click(screen.getByRole("button", { name: "Move Team A down" }));

      await waitFor(() =>
        expect(rpc).toHaveBeenCalledWith("admin_reorder_setup_teams", {
          p_draft_id: "draft-1",
          p_team_ids: ["team-b", "team-a", "team-c"],
        })
      );
    });

    it("cannot move the first team up or the last team down", () => {
      render(<TeamEditor {...props} teams={three} />);

      expect(
        (screen.getByRole("button", { name: "Move Team A up" }) as HTMLButtonElement).disabled
      ).toBe(true);
      expect(
        (screen.getByRole("button", { name: "Move Team C down" }) as HTMLButtonElement).disabled
      ).toBe(true);
    });

    it("shows the new order while saving, then restores it when the RPC fails", async () => {
      rpc.mockResolvedValue({ error: { message: "ORDER_INVALID: order repeats a team" } });
      render(<TeamEditor {...props} teams={three} />);

      fireEvent.click(screen.getByRole("button", { name: "Move Team C up" }));

      await screen.findByText("order repeats a team");
      expect(screen.getByLabelText("Nomination position for Team C").textContent).toBe("3");
      expect(onChanged).not.toHaveBeenCalled();
    });
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

  it("disables the typed setup form when a team already has two prefills", () => {
    render(
      <TeamEditor
        {...props}
        players={[
          ...players,
          { ...players[0], id: "jungle-1", display_name: "Jungle One", role: "jungle", team_id: "team-a", price: 0, acquisition: "free_agency" },
        ]}
      />
    );

    expect((screen.getByLabelText("Existing player") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Acquisition") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Point value") as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Add existing player" }) as HTMLButtonElement).disabled
    ).toBe(true);
    expect(screen.queryByPlaceholderText("Player name")).toBeNull();
  });

  it("disables the typed setup form for two legacy captain prefills", () => {
    render(
      <TeamEditor
        {...props}
        players={[
          ...players,
          { ...players[0], id: "jungle-1", display_name: "Jungle One", role: "jungle", team_id: "team-a", price: 8, acquisition: "captain" },
        ]}
      />
    );

    expect(screen.getByRole("option", { name: "Free Agency" })).toBeTruthy();
    expect((screen.getByLabelText("Existing player") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Acquisition") as HTMLSelectElement).disabled).toBe(true);
    expect((screen.getByLabelText("Point value") as HTMLInputElement).disabled).toBe(true);
    expect(
      (screen.getByRole("button", { name: "Add existing player" }) as HTMLButtonElement).disabled
    ).toBe(true);
  });
});
