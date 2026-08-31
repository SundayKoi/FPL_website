import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { FantasyStatRow } from "@/lib/stats/fantasyPoints";
import FantasyPointsTab from "./FantasyPointsTab";

const { fetchFantasyRows } = vi.hoisted(() => ({ fetchFantasyRows: vi.fn() }));
vi.mock("@/lib/stats/queries", () => ({ fetchFantasyRows }));

function game(over: Partial<FantasyStatRow> = {}): FantasyStatRow {
  return {
    summoner_name: "Doug",
    tag: "NA1",
    game_date: "2026-08-26T20:00:00Z",
    kills: 0,
    deaths: 0,
    assists: 0,
    cs_per_min: 0,
    vision_score: 0,
    damage_share_pct: 0,
    kill_participation_pct: 0,
    win: false,
    ...over,
  };
}

afterEach(() => {
  cleanup();
  fetchFantasyRows.mockReset();
});

function renderTab(rows: FantasyStatRow[]) {
  fetchFantasyRows.mockResolvedValue(rows);
  render(<FantasyPointsTab season="S5" phase="All" />);
}

describe("FantasyPointsTab", () => {
  const rows = [
    // Doug: 3 kills + a win one week, 1 kill the next.
    game({ kills: 3, win: true, game_date: "2026-08-25T20:00:00Z" }),
    game({ kills: 1, game_date: "2026-09-02T20:00:00Z" }),
    // Ana out-scores him on the season in a single game.
    game({ summoner_name: "Ana", tag: "EUW", kills: 10, game_date: "2026-09-02T20:00:00Z" }),
  ];

  it("opens on the season total, best first", async () => {
    renderTab(rows);
    await waitFor(() => expect(screen.getByText("Ana")).toBeTruthy());
    const names = screen.getAllByRole("row").slice(1).map((row) => row.textContent);
    expect(names[0]).toContain("Ana");
    expect(names[0]).toContain("30");
    expect(names[1]).toContain("Doug");
    // 3 kills + win = 14, plus 3 = 17.
    expect(names[1]).toContain("17");
  });

  it("re-ranks on a week and drops anyone who didn't play it", async () => {
    renderTab(rows);
    await waitFor(() => expect(screen.getByText("Ana")).toBeTruthy());

    // The earlier week is Doug's alone.
    fireEvent.click(screen.getByRole("button", { name: /WK Aug 24/i }));
    const body = screen.getAllByRole("row").slice(1);
    expect(body).toHaveLength(1);
    expect(body[0].textContent).toContain("Doug");
    expect(body[0].textContent).toContain("14");
  });

  it("prints the tariff, so the ranking can be argued with", async () => {
    // A points table without its point values is a leaderboard nobody can
    // check. These are read off the same constant the scorer uses.
    renderTab(rows);
    await waitFor(() => expect(screen.getByText("Point values")).toBeTruthy());
    expect(screen.getByText("Kill").parentElement?.textContent).toContain("3");
    expect(screen.getByText("Death").parentElement?.textContent).toContain("-1");
    expect(screen.getByText("Win").parentElement?.textContent).toContain("+5");
  });

  it("says so rather than showing an empty table", async () => {
    renderTab([]);
    await waitFor(() => expect(screen.getByText(/No games have been played/i)).toBeTruthy());
  });

  it("survives a fetch that fails", async () => {
    fetchFantasyRows.mockRejectedValue(new Error("network"));
    render(<FantasyPointsTab season="S5" phase="All" />);
    await waitFor(() => expect(screen.getByText(/Couldn't load fantasy points/i)).toBeTruthy());
  });

  it("names itself apart from the card game's lineup scoring", async () => {
    // Two ladders that rank the same players differently is fine; two
    // ladders nobody can tell apart is not.
    renderTab(rows);
    await waitFor(() => expect(screen.getByText(/Power Ranking/i)).toBeTruthy());
  });
});
