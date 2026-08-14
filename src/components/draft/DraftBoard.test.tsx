import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, render, screen } from "@testing-library/react";
import DraftBoard from "./DraftBoard";
import { useDraftState } from "@/hooks/useDraftState";

afterEach(cleanup);

vi.mock("@/hooks/useDraftState", () => ({ useDraftState: vi.fn() }));
vi.mock("@/hooks/useNemesisPicks", () => ({ useNemesisPicks: vi.fn(() => ({ picks: [] })) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }),
}));

const baseState = {
  draft: null,
  teams: [],
  players: [],
  lots: [],
  bids: [],
  profileId: null,
  myTeam: null,
  openLot: null,
  offsetMs: 0,
  connected: true,
  isAdmin: false,
  refetch: async () => {},
};

describe("DraftBoard missing-draft states", () => {
  beforeEach(() => vi.mocked(useDraftState).mockReset());

  it("shows loading before the first fetch completes", () => {
    vi.mocked(useDraftState).mockReturnValue({ ...baseState, loaded: false } as never);
    render(<DraftBoard draftId="nope" />);
    expect(screen.getByText(/Loading draft/)).toBeTruthy();
    expect(screen.queryByText(/Draft not found/)).toBeNull();
  });

  it("shows not-found once loading finished with no draft", () => {
    vi.mocked(useDraftState).mockReturnValue({ ...baseState, loaded: true } as never);
    render(<DraftBoard draftId="nope" />);
    expect(screen.getByText(/Draft not found/)).toBeTruthy();
    expect(screen.getByRole("link", { name: /Back to drafts/i })).toBeTruthy();
  });
});

describe("DraftBoard completed draft", () => {
  beforeEach(() => vi.mocked(useDraftState).mockReset());

  const completeDraft = {
    id: "d1", name: "Draft", status: "complete", countdown_seconds: 30,
    round_minimums: [10, 5, 1], current_round: 3, current_nominator_team_id: null,
    paused_time_remaining: null, created_at: "2026-08-14T00:00:00Z",
  };

  it("gives an admin the undo control once the draft is complete, without meaningless live controls", () => {
    vi.mocked(useDraftState).mockReturnValue({
      ...baseState,
      loaded: true,
      draft: completeDraft,
      isAdmin: true,
    } as never);
    render(<DraftBoard draftId="d1" />);

    // The undo control this branch was built for is reachable post-completion.
    expect(screen.getByRole("button", { name: "Undo last sale" })).toBeTruthy();
    // But live-only admin controls that are meaningless for a finished draft
    // must not render alongside it.
    expect(screen.queryByRole("button", { name: "Pause" })).toBeNull();
    expect(screen.queryByRole("button", { name: "Resume" })).toBeNull();
    expect(screen.queryByLabelText("Countdown (s)")).toBeNull();
  });

  it("does not give a non-admin the undo control on a completed draft", () => {
    vi.mocked(useDraftState).mockReturnValue({
      ...baseState,
      loaded: true,
      draft: completeDraft,
      isAdmin: false,
    } as never);
    render(<DraftBoard draftId="d1" />);

    expect(screen.queryByRole("button", { name: "Undo last sale" })).toBeNull();
  });
});
