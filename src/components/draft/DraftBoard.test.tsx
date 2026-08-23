import { afterEach, describe, expect, it, vi, beforeEach } from "vitest";
import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import DraftBoard from "./DraftBoard";
import { useDraftState } from "@/hooks/useDraftState";

afterEach(cleanup);

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

describe("DraftBoard live layout", () => {
  beforeEach(() => vi.mocked(useDraftState).mockReset());

  it("lets a disconnected viewer manually refresh the auction state", () => {
    const refetch = vi.fn(async () => {});
    vi.mocked(useDraftState).mockReturnValue({
      ...baseState,
      loaded: true,
      connected: false,
      refetch,
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
    } as never);

    render(<DraftBoard draftId="draft-1" />);

    expect(screen.getByRole("alert").textContent).toMatch(/live updates interrupted/i);
    fireEvent.click(screen.getByRole("button", { name: /retry now/i }));
    expect(refetch).toHaveBeenCalledOnce();
  });

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
    expect(screen.getByRole("banner").parentElement?.className).toContain("xl:mr-[22rem]");
    const chatRail = screen.getByRole("complementary", { name: "Draft chat rail" });
    expect(chatRail.className).toContain("xl:top-[5.5rem]");
    expect(chatRail.className).toContain("xl:h-[calc(100dvh-5.5rem)]");
    expect(chatRail.className).toContain("xl:fixed");
    expect(screen.getByRole("button", { name: "Collapse all" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Draft chat" })).toBeTruthy();
    expect(screen.getByText("Alpha")).toBeTruthy();
    expect(screen.getByText("Bravo")).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Collapse chat" }));
    expect(screen.getByRole("button", { name: "Open chat" })).toBeTruthy();
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
