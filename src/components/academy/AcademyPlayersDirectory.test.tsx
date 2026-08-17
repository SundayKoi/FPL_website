import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { PlayerPoolRow } from "@/components/players/PlayerPoolAdmin";
import { createClient } from "@/lib/supabase/client";
import AcademyPlayersDirectory from "./AcademyPlayersDirectory";

vi.mock("@/lib/supabase/client", () => ({ createClient: vi.fn() }));

afterEach(cleanup);

const fallbackPlayer = {
  name: "Sheet Fallback",
  role: "Top",
  rank: "E3",
  opggUrl: "https://op.gg/sheet-fallback",
};

const canonicalPlayer: PlayerPoolRow = {
  id: "academy-row-1",
  season_key: "academy-1",
  display_name: "Academy Canon",
  role: "top",
  rank: "E1",
  opgg_url: "https://op.gg/academy-canon",
};

describe("AcademyPlayersDirectory", () => {
  it("shows academy canonical rows and editing controls for admins", () => {
    render(
      <AcademyPlayersDirectory
        players={[fallbackPlayer]}
        canonicalPlayers={[canonicalPlayer]}
        isAdmin
      />,
    );

    expect(screen.getByText("Academy Canon")).toBeTruthy();
    expect(screen.queryByText("Sheet Fallback")).toBeNull();
    expect(screen.getByRole("button", { name: "Edit Player Pool" })).toBeTruthy();
  });

  it("keeps academy player-pool editing hidden for non-admins", () => {
    render(
      <AcademyPlayersDirectory
        players={[fallbackPlayer]}
        canonicalPlayers={[canonicalPlayer]}
        isAdmin={false}
      />,
    );

    expect(screen.getByText("Academy Canon")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Player Pool" })).toBeNull();
  });

  it("falls back to merged sheet and draft players when canonical rows are empty", () => {
    render(
      <AcademyPlayersDirectory players={[fallbackPlayer]} canonicalPlayers={[]} isAdmin={false} />,
    );

    expect(screen.getByRole("link", { name: "Sheet Fallback" })).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Edit Player Pool" })).toBeNull();
  });

  it("opens a sheet-backed Academy player's OP.GG link in a new tab", () => {
    render(<AcademyPlayersDirectory players={[fallbackPlayer]} canonicalPlayers={[]} />);

    const link = screen.getByRole("link", { name: "Sheet Fallback" });

    expect(link.getAttribute("href")).toBe("https://op.gg/sheet-fallback");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noopener noreferrer");
  });

  it("matches sheet OP.GG links to canonical Academy players by name", () => {
    render(
      <AcademyPlayersDirectory
        players={[{ ...fallbackPlayer, name: "Academy Canon" }]}
        canonicalPlayers={[{ ...canonicalPlayer, opgg_url: null }]}
      />,
    );

    expect(screen.getByRole("link", { name: "Academy Canon" }).getAttribute("href")).toBe(
      "https://op.gg/sheet-fallback",
    );
  });

  it("submits a valid Academy player through the rendered admin editor", async () => {
    const insert = vi.fn(() => ({
      select: vi.fn(() => ({
        single: vi.fn().mockResolvedValue({
          data: {
            id: "academy-row-2",
            season_key: "academy-1",
            display_name: "Academy New",
            role: "top",
            rank: "E2",
            opgg_url: "https://op.gg/academy-new",
          },
          error: null,
        }),
      })),
    }));
    vi.mocked(createClient).mockReturnValue({ from: () => ({ insert }) } as never);

    render(
      <AcademyPlayersDirectory
        players={[fallbackPlayer]}
        canonicalPlayers={[canonicalPlayer]}
        isAdmin
      />,
    );

    fireEvent.click(screen.getByRole("button", { name: "Edit Player Pool" }));
    fireEvent.change(screen.getByLabelText("Player name"), { target: { value: "Academy New" } });
    fireEvent.change(screen.getByLabelText("Player OP.GG URL"), {
      target: { value: "https://op.gg/academy-new" },
    });
    fireEvent.change(screen.getByLabelText("Player rank"), { target: { value: "E2" } });
    fireEvent.click(screen.getByRole("button", { name: "Add" }));

    await waitFor(() =>
      expect(insert).toHaveBeenCalledWith(
        expect.objectContaining({ season_key: "academy-1" }),
      ),
    );
  });
});
