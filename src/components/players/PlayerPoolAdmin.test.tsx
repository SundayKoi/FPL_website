import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayerPoolAdmin, { type PlayerPoolRow } from "./PlayerPoolAdmin";
import { createClient } from "@/lib/supabase/client";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));
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
});
