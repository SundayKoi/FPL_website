import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const {
  archiveEdition,
  fetchAllCardSeasons,
  fetchSeasonCards,
  fetchWeekCards,
  fetchWeekLineups,
  refreshHigherLowerSnapshot,
  settleGauntletWeek,
} = vi.hoisted(() => ({
  archiveEdition: vi.fn(),
  fetchAllCardSeasons: vi.fn(),
  fetchSeasonCards: vi.fn(),
  fetchWeekCards: vi.fn(),
  fetchWeekLineups: vi.fn(),
  refreshHigherLowerSnapshot: vi.fn(),
  settleGauntletWeek: vi.fn(),
}));

vi.mock("../src/lib/cards/editions", () => ({ archiveEdition }));
vi.mock("../src/lib/cards/queries", () => ({
  fetchAllCardSeasons,
  fetchLatestGameWeek: vi.fn(),
  fetchSeasonCards,
  fetchWeekCards,
}));
vi.mock("../src/lib/fantasy/queries", () => ({
  fetchBettingUsernames: vi.fn(),
  fetchWeekLineups,
}));
vi.mock("../src/lib/gauntlet/settle", () => ({ settleGauntletWeek }));
vi.mock("../src/lib/higher-lower/snapshot", () => ({ refreshHigherLowerSnapshot }));
vi.mock("../src/lib/fantasy/scoring", () => ({
  inventoryIdsIn: vi.fn(() => []),
  scoreLineup: vi.fn(),
  weeklyScoresBySlug: vi.fn(() => new Map()),
}));
vi.mock("../src/lib/fantasy/payouts", () => ({ planPayouts: vi.fn(() => []) }));
vi.mock("../src/lib/stats/weekly", () => ({ WEEKLY_STAT_COLUMNS: [] }));
vi.mock("../src/lib/betting/match-wins", () => ({
  formatMatchWinPayouts: vi.fn(() => ""),
}));

import { processSeason, runWeeklyCardDrop, type HigherLowerRefreshFailure } from "./weekly-card-drop";

const card = {
  slug: "weekly-card",
  name: "Weekly Card",
  overall: 80,
  role: "mid",
  archetype: "carry",
  standout: false,
  tier: { label: "gold" },
};

function createSupabase(): SupabaseClient {
  const from = vi.fn((table: string) => {
    const builder: Record<string, unknown> = {};
    for (const method of ["select", "eq", "not", "in", "order", "limit", "gte", "lt", "filter"]) {
      builder[method] = vi.fn(() => builder);
    }
    builder.upsert = vi.fn(() => builder);
    builder.insert = vi.fn(() => builder);
    builder.delete = vi.fn(() => builder);
    builder.maybeSingle = vi.fn(async () => ({ data: null, error: null }));
    builder.then = (resolve: (value: unknown) => unknown, reject?: (reason: unknown) => unknown) =>
      Promise.resolve({ data: table === "fixtures" ? [] : [], error: null }).then(resolve, reject);
    return builder;
  });
  return { from, rpc: vi.fn() } as unknown as SupabaseClient;
}

beforeEach(() => {
  vi.useFakeTimers();
  vi.setSystemTime(new Date("2026-09-07T12:00:00.000Z"));
  process.env.SKIP_INGEST_CHECK = "true";
  delete process.env.SHOWCASE;
  archiveEdition.mockReset();
  fetchAllCardSeasons.mockReset();
  fetchSeasonCards.mockReset();
  fetchWeekCards.mockReset();
  fetchWeekLineups.mockReset();
  refreshHigherLowerSnapshot.mockReset();
  settleGauntletWeek.mockReset();
  archiveEdition.mockResolvedValue({ error: null, pruned: 0 });
  fetchAllCardSeasons.mockResolvedValue([{ league: "premier", season: "S5" }]);
  fetchSeasonCards.mockResolvedValue([card]);
  fetchWeekCards.mockResolvedValue([card]);
  fetchWeekLineups.mockResolvedValue([]);
  refreshHigherLowerSnapshot.mockResolvedValue({ editionWeeks: ["2026-09-07"], candidateCount: 1 });
  settleGauntletWeek.mockResolvedValue({ settled: false, reason: "not settled" });
  vi.spyOn(console, "log").mockImplementation(() => undefined);
  vi.spyOn(console, "warn").mockImplementation(() => undefined);
  vi.spyOn(console, "error").mockImplementation(() => undefined);
});

afterEach(() => {
  delete process.env.SKIP_INGEST_CHECK;
  vi.restoreAllMocks();
  vi.useRealTimers();
});

describe("weekly card-drop Higher or Lower refresh", () => {
  it("refreshes immediately after a successful nonempty archive", async () => {
    const client = createSupabase();
    const failures: HigherLowerRefreshFailure[] = [];

    await processSeason(client, "premier", "S5", null, null, failures);

    expect(archiveEdition).toHaveBeenCalledOnce();
    expect(refreshHigherLowerSnapshot).toHaveBeenCalledWith(client, "premier", "S5", "2026-09-07");
    expect(failures).toEqual([]);
  });

  it("skips refresh for empty cards or an archive failure", async () => {
    const client = createSupabase();
    fetchSeasonCards.mockResolvedValueOnce([]);
    await processSeason(client, "premier", "S5", null, null);
    expect(refreshHigherLowerSnapshot).not.toHaveBeenCalled();

    fetchSeasonCards.mockResolvedValue([card]);
    archiveEdition.mockResolvedValue({ error: "prune failed", pruned: 0 });
    await processSeason(client, "premier", "S5", null, null);
    expect(refreshHigherLowerSnapshot).not.toHaveBeenCalled();
  });

  it("reports a refresh failure and continues with the other league", async () => {
    const client = createSupabase();
    const failures: HigherLowerRefreshFailure[] = [];
    refreshHigherLowerSnapshot
      .mockRejectedValueOnce(new Error("snapshot RPC unavailable"))
      .mockResolvedValueOnce({ editionWeeks: ["2026-09-07"], candidateCount: 1 });

    await processSeason(client, "premier", "S5", null, null, failures);
    await processSeason(client, "academy", "A5", null, null, failures);

    expect(refreshHigherLowerSnapshot).toHaveBeenCalledTimes(2);
    expect(failures).toHaveLength(1);
    expect(failures[0]).toMatchObject({ league: "premier", season: "S5", puzzleDate: "2026-09-07" });
  });

  it("fails after both leagues finish when a refresh was incomplete", async () => {
    const client = createSupabase();
    fetchAllCardSeasons.mockResolvedValue([
      { league: "premier", season: "S5" },
      { league: "academy", season: "A5" },
    ]);
    refreshHigherLowerSnapshot
      .mockRejectedValueOnce(new Error("snapshot RPC unavailable"))
      .mockResolvedValueOnce({ editionWeeks: ["2026-09-07"], candidateCount: 1 });

    await expect(runWeeklyCardDrop(client, null, null)).rejects.toThrow("Higher or Lower refresh incomplete");
    expect(refreshHigherLowerSnapshot).toHaveBeenCalledTimes(2);
  });
});
