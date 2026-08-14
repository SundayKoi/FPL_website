import { describe, expect, it, vi, beforeEach } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import DraftBoard from "./DraftBoard";
import { useDraftState } from "@/hooks/useDraftState";

vi.mock("@/hooks/useDraftState", () => ({ useDraftState: vi.fn() }));
vi.mock("./DraftChat", () => ({
  default: ({ onToggle }: { onToggle?: () => void }) => (
    <section aria-label="Draft chat">
      {onToggle && <button type="button" onClick={onToggle}>Collapse chat</button>}
    </section>
  ),
}));
vi.mock("./TeamColumn", () => ({
  default: ({ team }: { team: { name: string } }) => <article>{team.name}</article>,
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

describe("DraftBoard live layout", () => {
  beforeEach(() => vi.mocked(useDraftState).mockReset());

  it("keeps every team in the teams rail and renders one chat rail", () => {
    vi.mocked(useDraftState).mockReturnValue({
      ...baseState,
      loaded: true,
      draft: {
        id: "draft-1",
        name: "Summer Draft",
        status: "live",
        countdown_seconds: 30,
        round_minimums: [1],
        current_round: 1,
        current_nominator_team_id: null,
        paused_time_remaining: null,
        created_at: "2026-01-01T00:00:00.000Z",
      },
      teams: [
        {
          id: "team-1",
          draft_id: "draft-1",
          name: "Alpha",
          captain_profile_id: null,
          abbreviation: "ALP",
          image_url: null,
          banner_color: null,
          division: null,
          nomination_position: 1,
          budget_start: 100,
          points_remaining: 100,
        },
        {
          id: "team-2",
          draft_id: "draft-1",
          name: "Bravo",
          captain_profile_id: null,
          abbreviation: "BRV",
          image_url: null,
          banner_color: null,
          division: null,
          nomination_position: 2,
          budget_start: 100,
          points_remaining: 100,
        },
      ],
    } as never);

    render(<DraftBoard draftId="draft-1" />);

    expect(screen.getByRole("complementary", { name: "Draft teams" })).toBeTruthy();
    const chatRail = screen.getByRole("complementary", { name: "Draft chat rail" });
    expect(chatRail.className).toContain("lg:top-16");
    expect(chatRail.className).toContain("lg:h-[calc(100dvh-4rem)]");
    expect(chatRail.className).toContain("lg:fixed");
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Draft chat" })).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse chat" }));
    expect(screen.getByRole("button", { name: "Open chat" })).toBeTruthy();
  });
});
