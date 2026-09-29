import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { LeagueTeam, MatchReport, MatchReportGame } from "@/lib/matches/types";
import AdminReportsQueue from "./AdminReportsQueue";

const { fixGameSide, purgeMatchStats, deleteReport, statsRows, calls } = vi.hoisted(() => ({
  fixGameSide: vi.fn(),
  purgeMatchStats: vi.fn(),
  deleteReport: vi.fn(),
  /** What raw_stats still holds for the report's games. */
  statsRows: [] as { match_id: string }[],
  /** The order the delete and the purge actually happened in. */
  calls: [] as string[],
}));

vi.mock("@/lib/captain/queries", () => ({ fixGameSide, purgeMatchStats }));
vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }));
vi.mock("@/lib/supabase/client", () => ({
  createClient: () => ({
    from: (table: string) => {
      if (table === "raw_stats") {
        return { select: () => ({ in: () => Promise.resolve({ data: statsRows, error: null }) }) };
      }
      if (table === "match_reports") {
        return {
          delete: () => ({
            eq: (...args: unknown[]) => {
              calls.push("delete");
              return deleteReport(...args);
            },
          }),
        };
      }
      throw new Error(`unexpected table ${table}`);
    },
  }),
}));

const teams = [
  { id: "team-a", name: "Alcatraz", abbreviation: "ALC", active: true },
  { id: "team-b", name: "Wildcats", abbreviation: "WLD", active: true },
] as unknown as LeagueTeam[];

const report = {
  id: "report-1",
  season: "S5",
  season_phase: "Playoffs",
  team_a_id: "team-a",
  team_b_id: "team-b",
  score_a: 2,
  score_b: 1,
  status: "ingested",
  error_text: null,
  warning_text: null,
  fixture_id: null,
  forfeit_team_id: null,
  forfeit_note: null,
} as unknown as MatchReport;

const games = [
  { id: "g1", report_id: "report-1", game_number: 1, match_id: "NA1_1", status: "ingested", error_text: null },
  { id: "g2", report_id: "report-1", game_number: 2, match_id: "NA1_2", status: "ingested", error_text: null },
  { id: "g3", report_id: "report-1", game_number: 3, match_id: "NA1_3", status: "failed", error_text: "nope" },
] as unknown as MatchReportGame[];

function renderQueue() {
  return render(<AdminReportsQueue reports={[report]} games={games} teams={teams} initiallyOpen />);
}

beforeEach(() => {
  vi.stubGlobal("confirm", vi.fn(() => true));
  deleteReport.mockResolvedValue({ error: null });
  purgeMatchStats.mockImplementation(async () => {
    calls.push("purge");
    return { statsDeleted: 20, gamesReset: 0, reportsReset: 0 };
  });
});

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
  fixGameSide.mockReset();
  purgeMatchStats.mockReset();
  deleteReport.mockReset();
  statsRows.length = 0;
  calls.length = 0;
});

describe("AdminReportsQueue delete", () => {
  // A deleted report used to leave its ingested rows in raw_stats. The stats
  // pages kept the wrong attribution and the games could never be reported
  // again: the form refused the ids, the ingester skipped them.
  it("deletes the report, then purges exactly the games that have stats, and says so first", async () => {
    statsRows.push({ match_id: "NA1_1" }, { match_id: "NA1_1" }, { match_id: "NA1_2" });
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(purgeMatchStats).toHaveBeenCalledTimes(1));
    expect(String((confirm as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).toMatch(
      /ingested stats for 2 of its games/i,
    );
    expect(deleteReport).toHaveBeenCalledWith("id", "report-1");
    // The game that never ingested is not sent along.
    expect(purgeMatchStats.mock.calls[0][1]).toEqual(["NA1_1", "NA1_2"]);
    expect(calls).toEqual(["delete", "purge"]);
  });

  it("leaves the purge alone when nothing was ingested", async () => {
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(deleteReport).toHaveBeenCalledTimes(1));
    expect(String((confirm as unknown as { mock: { calls: unknown[][] } }).mock.calls[0][0])).not.toMatch(/stats/i);
    expect(purgeMatchStats).not.toHaveBeenCalled();
  });

  it("does nothing when the admin backs out", async () => {
    statsRows.push({ match_id: "NA1_1" });
    vi.stubGlobal("confirm", vi.fn(() => false));
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    await waitFor(() => expect(confirm).toHaveBeenCalledTimes(1));
    expect(deleteReport).not.toHaveBeenCalled();
    expect(purgeMatchStats).not.toHaveBeenCalled();
  });

  it("says when the report went but its stats did not", async () => {
    statsRows.push({ match_id: "NA1_1" });
    purgeMatchStats.mockRejectedValue(new Error("NOT_ADMIN: admin access required"));
    renderQueue();
    fireEvent.click(screen.getByRole("button", { name: /delete/i }));

    expect(await screen.findByRole("alert")).toHaveProperty(
      "textContent",
      expect.stringMatching(/report deleted, but its ingested stats could not be cleared: NOT_ADMIN/i),
    );
    expect(deleteReport).toHaveBeenCalledTimes(1);
  });
});
