import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { Player } from "@/lib/draft/types";
import PlayerPoolEditor from "./PlayerPoolEditor";

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ from: vi.fn() }),
}));

function player(overrides: Partial<Player> = {}): Player {
  return {
    id: "player-1",
    draft_id: "draft-1",
    display_name: "Canny",
    role: "top",
    rank: "M10",
    opgg_url: null,
    notes: null,
    team_id: null,
    price: null,
    acquisition: null,
    ...overrides,
  };
}

afterEach(() => cleanup());

describe("PlayerPoolEditor", () => {
  it("shows the current player point value during draft setup", () => {
    render(
      <PlayerPoolEditor
        draftId="draft-1"
        players={[player(), player({ id: "unknown", display_name: "Mystery Player" })]}
        onChanged={vi.fn()}
      />
    );

    expect(screen.getByText("Points")).toBeTruthy();
    expect(screen.getByText("30")).toBeTruthy();
    expect(screen.getByText("-")).toBeTruthy();
  });
});
