import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { OffseasonMatchCode } from "@/lib/offseason/types";
import type { OffseasonAdminData } from "./shared";

const { addMatchCodesAction, removeMatchCodeAction } = vi.hoisted(() => ({
  addMatchCodesAction: vi.fn(),
  removeMatchCodeAction: vi.fn(),
}));
vi.mock("@/lib/offseason/actions", () => ({ addMatchCodesAction, removeMatchCodeAction }));

import MatchCodesAdmin from "./MatchCodesAdmin";

afterEach(() => {
  cleanup();
  vi.clearAllMocks();
});

function data(codes: OffseasonMatchCode[]): OffseasonAdminData {
  return {
    event: { id: "event", name: "Cup", status: "running", signups_open: false, yardstick_season: "S6", created_at: "" },
    entrants: [],
    weeks: [{ id: "w1", event_id: "event", week_number: 1, status: "playing", elimination_per_role: 0, main_draft_id: null, elimination_draft_id: null, draft_at: null, games_at: null, created_at: "" }],
    entries: [],
    teams: [],
    members: [],
    matches: [
      { id: "m1", week_id: "w1", stage: "round_robin", sort_order: 1, team_a_id: "a", team_b_id: "b", best_of: 1, winner_team_id: null },
      { id: "m2", week_id: "w1", stage: "round_robin", sort_order: 2, team_a_id: "c", team_b_id: "d", best_of: 1, winner_team_id: null },
    ],
    games: [],
    ratings: {},
    drafts: {},
    codes,
    subs: [],
    mvp: { nominees: [], lines: {} },
  };
}

describe("MatchCodesAdmin", () => {
  it("adds a pasted batch and says where the codes went", async () => {
    addMatchCodesAction.mockResolvedValue({ ok: true, added: 2, skipped: 1, assigned: 2, pooled: 0 });
    render(<MatchCodesAdmin data={data([])} />);
    expect(screen.getByText("2 games still need a code.")).toBeTruthy();
    fireEvent.change(screen.getByRole("textbox", { name: "Tournament codes to add" }), { target: { value: "NA0-one\nNA0-two\n\nNA0-one\n" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 3 codes" }));
    await waitFor(() => expect(screen.getByRole("status").textContent).toBe("Added 2 codes (1 already stored). 2 went to games; 0 are waiting for new matches."));
    expect(addMatchCodesAction).toHaveBeenCalledWith("event", ["NA0-one", "NA0-two", "NA0-one"]);
    expect((screen.getByRole("textbox", { name: "Tournament codes to add" }) as HTMLTextAreaElement).value).toBe("");
  });

  it("lists the codes waiting and throws a bad one away", async () => {
    removeMatchCodeAction.mockResolvedValue({ ok: true });
    render(
      <MatchCodesAdmin
        data={data([
          { id: "c1", event_id: "event", seq: 1, code: "NA0-one", match_id: "m1", game_number: 1 },
          { id: "c2", event_id: "event", seq: 2, code: "NA0-two", match_id: "m2", game_number: 1 },
          { id: "c3", event_id: "event", seq: 3, code: "NA0-spare", match_id: null, game_number: null },
        ])}
      />,
    );
    expect(screen.getByText("Every scheduled game has a code.")).toBeTruthy();
    expect(screen.getByText("1 code waiting.")).toBeTruthy();
    expect(screen.queryByText("NA0-one")).toBeNull();
    fireEvent.click(screen.getByRole("button", { name: "Remove" }));
    await waitFor(() => expect(removeMatchCodeAction).toHaveBeenCalledWith("c3"));
  });

  it("shows the database's refusal", async () => {
    addMatchCodesAction.mockResolvedValue({ ok: false, error: '"bad!" is not a tournament code' });
    render(<MatchCodesAdmin data={data([])} />);
    fireEvent.change(screen.getByRole("textbox", { name: "Tournament codes to add" }), { target: { value: "bad!" } });
    fireEvent.click(screen.getByRole("button", { name: "Add 1 code" }));
    await waitFor(() => expect(screen.getByRole("alert").textContent).toBe('"bad!" is not a tournament code'));
  });
});
