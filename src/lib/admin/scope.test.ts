import { beforeEach, describe, expect, it, vi } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";

const { fetchLeagueSeasons } = vi.hoisted(() => ({ fetchLeagueSeasons: vi.fn() }));

vi.mock("@/lib/league/season", async (importOriginal) => ({
  ...(await importOriginal<typeof import("@/lib/league/season")>()),
  fetchLeagueSeasons,
}));

import { resolveAdminLeagueSeason } from "./scope";

function fixtureQuery(result: { data: { season: string }[] | null; error: unknown }) {
  const query = {
    select: vi.fn(() => query),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return query;
}

function client(result: { data: { season: string }[] | null; error: unknown }) {
  return { from: vi.fn(() => fixtureQuery(result)) } as unknown as SupabaseClient;
}

describe("resolveAdminLeagueSeason", () => {
  beforeEach(() => {
    vi.clearAllMocks();
    fetchLeagueSeasons.mockResolvedValue({ premier: "S5", academy: "A2" });
  });

  it("keeps Premier season choices separate from Academy codes", async () => {
    const scope = await resolveAdminLeagueSeason(client({
      data: [{ season: "S4" }, { season: "S5" }, { season: "S5 beta" }, { season: "A1" }, { season: "A2" }],
      error: null,
    }), { league: "premier", season: "A1" });

    expect(scope).toMatchObject({
      league: "premier",
      season: "S5",
      seasonOptions: ["S5", "S4"],
      optionsAvailable: true,
    });
  });

  it("accepts a valid historical season only within the selected league", async () => {
    const scope = await resolveAdminLeagueSeason(client({
      data: [{ season: "S4" }, { season: "S5" }, { season: "A1" }, { season: "A2" }],
      error: null,
    }), { league: "academy", season: "A1" });

    expect(scope.season).toBe("A1");
    expect(scope.seasonOptions).toEqual(["A2", "A1"]);
  });

  it("uses the configured league season and reports unavailable history on fixture query failure", async () => {
    const scope = await resolveAdminLeagueSeason(client({ data: null, error: new Error("offline") }), { league: "academy", season: "A1" });

    expect(scope).toMatchObject({
      league: "academy",
      season: "A2",
      seasonOptions: ["A2"],
      optionsAvailable: false,
    });
  });
});
