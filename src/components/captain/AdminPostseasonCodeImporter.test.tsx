import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { MatchCode } from "@/lib/captain/queries";
import type { LeagueTeam } from "@/lib/matches/types";
import type { FixtureRow } from "@/lib/schedule/types";
import AdminPostseasonCodeImporter from "./AdminPostseasonCodeImporter";

const { rpc, refresh } = vi.hoisted(() => ({
  rpc: vi.fn(),
  refresh: vi.fn(),
}));

vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({ rpc }),
}));

vi.mock("next/navigation", () => ({
  useRouter: () => ({ refresh }),
}));

const teams: LeagueTeam[] = [
  { id: "a", name: "Alpha", abbreviation: "A", active: true },
  { id: "b", name: "Bravo", abbreviation: "B", active: true },
];

const fixtures: FixtureRow[] = [
  {
    id: "r1",
    season: "S5",
    stage: "gauntlet_r1",
    division: null,
    team_a: "Alpha",
    team_b: "Bravo",
    scheduled_at: null,
    best_of: 1,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
  },
  {
    id: "qf",
    season: "S5",
    stage: "quarterfinals",
    division: null,
    team_a: null,
    team_b: "Bravo",
    scheduled_at: null,
    best_of: 5,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-01T00:00:00Z",
  },
];

const codes: MatchCode[] = [];

afterEach(() => {
  cleanup();
  rpc.mockReset();
  refresh.mockReset();
});

describe("AdminPostseasonCodeImporter", () => {
  it("previews missing slots and saves only after review", async () => {
    rpc.mockResolvedValue({ data: { inserted_count: 1, fixture_count: 1 }, error: null });
    render(<AdminPostseasonCodeImporter fixtures={fixtures} teams={teams} codes={codes} league="premier" season="S5" />);

    fireEvent.change(screen.getByLabelText("Tournament codes"), { target: { value: "R1-CODE, EXTRA" } });
    fireEvent.click(screen.getByRole("button", { name: /preview assignments/i }));

    const preview = await screen.findByRole("table", { name: /postseason assignment preview/i });
    const row = within(preview).getAllByRole("row")[1];
    expect(within(row).getByText("Gauntlet — Round 1")).toBeTruthy();
    expect(within(row).getByText("Bo1")).toBeTruthy();
    expect(within(row).getByText("G1: R1-CODE")).toBeTruthy();
    expect(screen.getByText(/1 unused input code/i)).toBeTruthy();
    expect(screen.getByText(/TBD opponent/i)).toBeTruthy();
    expect(rpc).not.toHaveBeenCalled();

    fireEvent.click(screen.getByRole("button", { name: /populate codes/i }));

    await waitFor(() => {
      expect(rpc).toHaveBeenCalledWith("populate_postseason_match_codes", expect.objectContaining({
        p_league: "premier",
        p_season: "S5",
        p_scope: "all-postseason",
        p_codes: ["R1-CODE", "EXTRA"],
        p_expected_missing_slots: 1,
      }));
      expect(refresh).toHaveBeenCalled();
    });
    expect(screen.getByText(/populated 1 game code across 1 fixture/i)).toBeTruthy();
  });

  it("surfaces duplicate input before calling the RPC", async () => {
    render(<AdminPostseasonCodeImporter fixtures={fixtures} teams={teams} codes={codes} league="academy" season="A1" />);

    fireEvent.change(screen.getByLabelText("Tournament codes"), { target: { value: "DUP\nDUP" } });
    fireEvent.click(screen.getByRole("button", { name: /preview assignments/i }));

    expect((await screen.findByRole("alert")).textContent).toContain("Duplicate tournament code");
    expect(rpc).not.toHaveBeenCalled();
  });
});
