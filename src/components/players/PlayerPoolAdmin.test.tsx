import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayerPoolAdmin, { type PlayerPoolRow } from "./PlayerPoolAdmin";
import { createClient } from "@/lib/supabase/client";
import { assignPlayerIdentity } from "@/lib/players/identityActions";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
vi.mock("@/lib/players/identityActions", () => ({
  assignPlayerIdentity: vi.fn(),
  replacePlayerIdentity: vi.fn(),
  revokePlayerIdentity: vi.fn(),
}));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
afterEach(cleanup);

const player: PlayerPoolRow = {
  id: "player-1",
  season_key: "season-5",
  display_name: "Canny#rip",
  role: "top",
  rank: "M10",
  opgg_url: "https://op.gg/lol/summoners/na/Canny-rip",
};

describe("PlayerPoolAdmin", () => {
  it("shows validation before writing an incomplete player", async () => {
    render(<PlayerPoolAdmin seasonKey="season-5" players={[]} onPlayersChange={vi.fn()} />);
    fireEvent.click(screen.getByRole("button", { name: "Add" }));
    expect(screen.getByText("Player name and OP.GG URL are required.")).toBeTruthy();
  });

  it("edits a player and preserves the exact URL", async () => {
    const update = vi.fn(() => ({ eq: vi.fn(() => ({ select: vi.fn(() => ({ single: vi.fn().mockResolvedValue({ data: { ...player, opgg_url: "https://op.gg/exact?x=1" }, error: null }) })) })) }));
    vi.mocked(createClient).mockReturnValue({ from: () => ({ update }) } as never);
    const onPlayersChange = vi.fn();
    render(<PlayerPoolAdmin seasonKey="season-5" players={[player]} onPlayersChange={onPlayersChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Edit" }));
    fireEvent.change(screen.getByLabelText("Player OP.GG URL"), { target: { value: "https://op.gg/exact?x=1" } });
    fireEvent.click(screen.getByRole("button", { name: "Save" }));
    await waitFor(() => expect(onPlayersChange).toHaveBeenCalled());
    expect(update).toHaveBeenCalledWith(expect.objectContaining({ opgg_url: "https://op.gg/exact?x=1" }));
  });

  it("warns before removing a player and preserves draft history", async () => {
    const remove = vi.fn(() => ({ eq: vi.fn().mockResolvedValue({ error: null }) }));
    vi.mocked(createClient).mockReturnValue({ from: () => ({ delete: remove }) } as never);
    vi.spyOn(window, "confirm").mockReturnValue(true);
    const onPlayersChange = vi.fn();
    render(<PlayerPoolAdmin seasonKey="season-5" players={[player]} onPlayersChange={onPlayersChange} />);
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    expect(window.confirm).toHaveBeenCalledWith(expect.stringContaining("Draft history will be preserved"));
    await waitFor(() => expect(onPlayersChange).toHaveBeenCalledWith([]));
  });

  it("writes academy players into the academy pool", async () => {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "player-2",
            season_key: "academy-1",
            display_name: "Academy One",
            role: "top",
            rank: "E1",
            opgg_url: "https://op.gg/academy-one",
          },
          error: null,
        }),
      })),
    }));
    vi.mocked(createClient).mockReturnValue({ from: () => ({ insert }) } as never);

    render(<PlayerPoolAdmin seasonKey="academy-1" players={[]} onPlayersChange={vi.fn()} />);
    fireEvent.change(screen.getByLabelText("Player name"), { target: { value: "Academy One" } });
    fireEvent.change(screen.getByLabelText("Player OP.GG URL"), {
      target: { value: "https://op.gg/academy-one" },
    });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ season_key: "academy-1" }),
      ),
    );
  });

  it("renders identity administration beside each existing canonical player", async () => {
    vi.mocked(assignPlayerIdentity).mockResolvedValue({ ok: true });
    render(
      <PlayerPoolAdmin
        seasonKey="season-5"
        players={[player]}
        onPlayersChange={vi.fn()}
        identityLeague="premier"
        identitySeason="S5"
        identityLinks={[]}
        identityProfiles={[
          { id: "profile-2", displayName: "Verified Bravo", discordId: "222222" },
        ]}
      />,
    );

    const playerRow = screen.getByText("Canny#rip").closest("li");
    expect(playerRow).toBeTruthy();
    fireEvent.change(
      within(playerRow as HTMLElement).getByRole("combobox", { name: /verified discord profile/i }),
      { target: { value: "profile-2" } },
    );
    fireEvent.click(within(playerRow as HTMLElement).getByRole("button", { name: /link profile/i }));

    await waitFor(() =>
      expect(assignPlayerIdentity).toHaveBeenCalledWith(
        expect.objectContaining({ playerPoolId: "player-1", profileId: "profile-2" }),
      ),
    );
  });

  it("excludes profiles linked to another player from each row picker", () => {
    const otherPlayer: PlayerPoolRow = {
      ...player,
      id: "player-2",
      display_name: "Other Player",
    };
    render(
      <PlayerPoolAdmin
        seasonKey="season-5"
        players={[player, otherPlayer]}
        onPlayersChange={vi.fn()}
        identityLeague="premier"
        identitySeason="S5"
        identityLinks={[
          { id: "link-1", playerPoolId: "player-1", profileId: "profile-1", status: "approved" },
          { id: "link-2", playerPoolId: "player-2", profileId: "profile-2", status: "approved" },
        ]}
        identityProfiles={[
          { id: "profile-1", displayName: "Current Profile", discordId: "111111" },
          { id: "profile-2", displayName: "Already Used", discordId: "222222" },
          { id: "profile-3", displayName: "Available Profile", discordId: "333333" },
        ]}
      />,
    );

    const playerRow = screen.getByText("Canny#rip").closest("li");
    const picker = within(playerRow as HTMLElement).getByRole("combobox", {
      name: /verified discord profile/i,
    });
    expect(within(picker).getByRole("option", { name: /Current Profile/ })).toBeTruthy();
    expect(within(picker).getByRole("option", { name: /Available Profile/ })).toBeTruthy();
    expect(within(picker).queryByRole("option", { name: /Already Used/ })).toBeNull();
  });
});
