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
    // Doug plays TWICE in the week of Aug 24 — 14 points and 3 — so that
    // week scores 8.5, not 17. Then once more the following week for 3.
    game({ kills: 3, win: true, game_date: "2026-08-25T20:00:00Z" }),
    game({ kills: 1, game_date: "2026-08-26T20:00:00Z" }),
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
    // 8.5 for his first week (the mean of 14 and 3) plus 3 for his second.
    expect(names[1]).toContain("11.5");
  });

  it("counts a week once however many games are in it", async () => {
    // The correction this table exists in: Doug played three games across
    // two weeks, and the season is the sum of TWO weekly scores.
    renderTab(rows);
    await waitFor(() => expect(screen.getByText("Ana")).toBeTruthy());
    const doug = screen.getAllByRole("row").find((row) => row.textContent?.includes("Doug"))!;
    const cells = [...doug.querySelectorAll("td")].map((cell) => cell.textContent);
    // rank, player, weeks, games, wins, points, points per week
    expect(cells[2]).toBe("2");
    expect(cells[3]).toBe("3");
    expect(cells[5]).toBe("11.5");
  });

  it("re-ranks on a week and drops anyone who didn't play it", async () => {
    renderTab(rows);
    await waitFor(() => expect(screen.getByText("Ana")).toBeTruthy());

    // The earlier week is Doug's alone.
    fireEvent.click(screen.getByRole("button", { name: /WK Aug 24/i }));
    const body = screen.getAllByRole("row").slice(1);
    expect(body).toHaveLength(1);
    expect(body[0].textContent).toContain("Doug");
    // The AVERAGE of that week's two games, not their sum.
    expect(body[0].textContent).toContain("8.5");
    expect(body[0].textContent).not.toContain("17");
  });

  it("explains the maths on the page", async () => {
    // "Why is my week lower than my games add up to" is the first question
    // this table will get asked.
    renderTab(rows);
    await waitFor(() => expect(screen.getByText(/average/i)).toBeTruthy());
    expect(screen.getByText(/sum of those weekly scores/i)).toBeTruthy();
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
