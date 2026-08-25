import { describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { weekCards, seasonCards } = vi.hoisted(() => ({
  weekCards: vi.fn(async () => [{ slug: "week" }]),
  seasonCards: vi.fn(async () => [{ slug: "season" }]),
}));

vi.mock("./queries", async (importOriginal) => {
  const actual = await importOriginal<typeof import("./queries")>();
  return { ...actual, fetchWeekCards: weekCards, fetchSeasonCards: seasonCards };
});

/** Only the last-game lookup matters here; the builds are mocked. */
function client(gameDate: string | null, error: unknown = null): SupabaseClient {
  return {
    from() {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "not", "order", "limit"]) chain[method] = () => chain;
      chain.maybeSingle = async () => ({ data: gameDate ? { game_date: gameDate } : null, error });
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("fetchLatestGameWeek", () => {
  it("returns the Monday of the most recent game, on the Eastern calendar", async () => {
    const { fetchLatestGameWeek } = await import("./queries");
    // Tuesday 2026-08-25 belongs to the week that opened Monday the 24th.
    expect(await fetchLatestGameWeek(client("2026-08-25T02:00:00Z"), "S5")).toBe("2026-08-24");
  });

  it("returns null before any game is ingested", async () => {
    const { fetchLatestGameWeek } = await import("./queries");
    expect(await fetchLatestGameWeek(client(null), "S5")).toBeNull();
  });

  it("returns null rather than throwing when the read fails", async () => {
    const { fetchLatestGameWeek } = await import("./queries");
    expect(await fetchLatestGameWeek(client("2026-08-25T02:00:00Z"), "S5")).toBeTruthy();
    expect(await fetchLatestGameWeek(client(null, { message: "boom" }), "S5")).toBeNull();
  });
});
