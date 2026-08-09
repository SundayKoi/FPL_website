import { describe, expect, it, vi, beforeEach } from "vitest";
import { render, screen } from "@testing-library/react";
import DraftBoard from "./DraftBoard";
import { useDraftState } from "@/hooks/useDraftState";

vi.mock("@/hooks/useDraftState", () => ({ useDraftState: vi.fn() }));

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
