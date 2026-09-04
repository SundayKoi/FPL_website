import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { MatchCode } from "@/lib/captain/queries";
import type { FixtureRow } from "@/lib/schedule/types";
import { TournamentCodeGrid } from "./TournamentCodeGrid";

const fixture: FixtureRow = {
  id: "fixture-1", season: "S5", stage: "week_1", division: "Solari", team_a: "Meridian", team_b: "Other",
  scheduled_at: "2026-09-07T00:00:00Z", best_of: 3, score_a: null, score_b: null, sort_order: 1, created_at: "2026-08-01T00:00:00Z",
};

function code(game_number: number, value: string): MatchCode {
  return { id: `code-${game_number}`, fixture_id: fixture.id, season: "S5", team_a_id: "a", team_b_id: "b", game_number, code: value, note: null, created_by: null, created_at: `2026-08-01T00:0${game_number}:00Z` };
}

afterEach(() => { cleanup(); vi.useRealTimers(); });
beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText: vi.fn() } });
});

describe("TournamentCodeGrid", () => {
  it("renders expected Bo3 slots and copies posted codes in game order", async () => {
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    writeText.mockResolvedValue(undefined);
    render(<TournamentCodeGrid fixture={fixture} codes={[code(3, "CODE-3"), code(1, "CODE-1")] } />);

    expect(screen.getAllByRole("article")).toHaveLength(3);
    const cards = screen.getAllByRole("article");
    expect(cards[0].textContent).toContain("CODE-1");
    expect(cards[1].textContent).toContain("Not posted yet");
    expect(cards[2].textContent).toContain("CODE-3");
    expect(screen.getAllByRole("button", { name: /copy game/i })).toHaveLength(2);

    fireEvent.click(screen.getByRole("button", { name: /copy all/i }));
    await waitFor(() => expect(writeText).toHaveBeenCalledWith("CODE-1\nCODE-3"));
  });

  it("handles clipboard rejection without an unhandled promise", async () => {
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    writeText.mockRejectedValue(new Error("clipboard denied"));
    render(<TournamentCodeGrid fixture={fixture} codes={[code(1, "CODE-1")] } />);

    fireEvent.click(screen.getByRole("button", { name: /copy game 1/i }));
    await act(async () => { await Promise.resolve(); });
    expect(screen.getByRole("button", { name: /copy game 1/i })).toBeTruthy();
  });

  it("restores a successful copy label and shows no fake slots without a fixture", async () => {
    const writeText = navigator.clipboard.writeText as ReturnType<typeof vi.fn>;
    writeText.mockResolvedValue(undefined);
    render(<TournamentCodeGrid fixture={null} codes={[]} />);
    expect(screen.getByText(/no upcoming match/i)).toBeTruthy();
    expect(screen.queryByText(/Game 1/)).toBeNull();

    render(<TournamentCodeGrid fixture={fixture} codes={[code(1, "CODE-1")]} />);
    fireEvent.click(screen.getByRole("button", { name: /copy game 1/i }));
    await waitFor(() => expect(screen.getByRole("button", { name: /copied game 1/i })).toBeTruthy());
  });
});
