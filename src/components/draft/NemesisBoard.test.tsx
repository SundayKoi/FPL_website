import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { NemesisPick, Team } from "@/lib/draft/types";
import NemesisBoard from "./NemesisBoard";

const { rpc } = vi.hoisted(() => ({ rpc: vi.fn().mockResolvedValue({ error: null }) }));
vi.mock("@/lib/supabase/client", () => ({ createClient: () => ({ rpc }) }));

const team = (id: string, name: string, captain: string | null = null): Team => ({
  id, draft_id: "d1", name, captain_profile_id: captain,
  abbreviation: name.slice(0, 2).toUpperCase(), image_url: null, banner_color: null,
  division: null, nomination_position: 1, budget_start: 100, points_remaining: 100,
});

const pick = (
  n: number, chosen: string, division: "Lunari" | "Solari", chooser: string | null
): NemesisPick => ({
  id: `p${n}`, draft_id: "d1", pick_number: n, chooser_team_id: chooser,
  chosen_team_id: chosen, division, created_at: "2026-08-14T00:00:00Z",
});

const teams = [team("a", "Alpha"), team("b", "Bravo"), team("c", "Charlie"), team("d", "Delta")];
const onError = vi.fn();
const props = { draftId: "d1", teams, picks: [] as NemesisPick[], myTeamId: null, isAdmin: false, onError };

afterEach(() => {
  cleanup();
  rpc.mockClear();
  rpc.mockResolvedValue({ error: null });
  onError.mockClear();
});

describe("NemesisBoard", () => {
  it("tells spectators the draft hasn't started", () => {
    render(<NemesisBoard {...props} />);

    expect(screen.getByText("Nemesis draft hasn't started yet.")).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Start nemesis draft" })).toBeNull();
  });

  it("seeds the draft from the admin panel", async () => {
    render(<NemesisBoard {...props} isAdmin />);

    fireEvent.change(screen.getByLabelText("First team"), { target: { value: "c" } });
    fireEvent.change(screen.getByLabelText("Starting division"), { target: { value: "Solari" } });
    fireEvent.click(screen.getByRole("button", { name: "Start nemesis draft" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("nemesis_start", {
        p_draft_id: "d1", p_team_id: "c", p_division: "Solari",
      })
    );
  });

  it("shows who is on the clock without offering picks to other captains", () => {
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId="b" />);

    expect(screen.getByText(/Alpha is on the clock/)).toBeTruthy();
    expect(screen.queryByRole("button", { name: "Send Charlie to Solari" })).toBeNull();
  });

  it("lets the captain on the clock banish an unplaced team", async () => {
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId="a" />);

    fireEvent.click(screen.getByRole("button", { name: "Send Charlie to Solari" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("nemesis_pick", {
        p_draft_id: "d1", p_chosen_team_id: "c",
      })
    );
  });

  it("never offers an already-placed team", () => {
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId="a" />);

    expect(screen.queryByRole("button", { name: "Send Alpha to Solari" })).toBeNull();
  });

  it("lets an admin pick for the team on the clock", async () => {
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId={null} isAdmin />);

    fireEvent.click(screen.getByRole("button", { name: "Send Bravo to Solari" }));

    await waitFor(() =>
      expect(rpc).toHaveBeenCalledWith("nemesis_pick", {
        p_draft_id: "d1", p_chosen_team_id: "b",
      })
    );
  });

  it("reports a rejected pick through onError", async () => {
    rpc.mockResolvedValue({ error: { message: "NOT_YOUR_TURN: it is not your turn to pick" } });
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} myTeamId="a" />);

    fireEvent.click(screen.getByRole("button", { name: "Send Bravo to Solari" }));

    await waitFor(() => expect(onError).toHaveBeenCalled());
  });

  it("undoes and resets from the admin controls", async () => {
    vi.spyOn(window, "confirm").mockReturnValue(true);
    render(<NemesisBoard {...props} picks={[pick(0, "a", "Lunari", null)]} isAdmin />);

    fireEvent.click(screen.getByRole("button", { name: "Undo last pick" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("nemesis_undo", { p_draft_id: "d1" }));

    fireEvent.click(screen.getByRole("button", { name: "Reset nemesis draft" }));
    await waitFor(() => expect(rpc).toHaveBeenCalledWith("nemesis_reset", { p_draft_id: "d1" }));
  });

  it("shows the final divisions and pick order when complete", () => {
    render(
      <NemesisBoard
        {...props}
        picks={[
          pick(0, "a", "Lunari", null),
          pick(1, "b", "Solari", "a"),
          pick(2, "c", "Lunari", "b"),
          pick(3, "d", "Solari", "c"),
        ]}
      />
    );

    expect(screen.getByText("Nemesis draft complete")).toBeTruthy();
    expect(screen.getByText("Bravo sent Charlie to Lunari")).toBeTruthy();
    expect(screen.queryByRole("button", { name: /^Send / })).toBeNull();
  });
});
