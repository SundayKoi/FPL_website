import { afterEach, describe, expect, it, vi } from "vitest";
import { fetchHomepageStandings } from "./standings";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

function query(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => Promise.resolve(result),
    single: () => Promise.resolve(result),
    then: (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve),
  };
  return builder;
}

afterEach(() => {
  createServerSupabase.mockReset();
});

describe("fetchHomepageStandings", () => {
  it("loads featured-draft teams as initial 0–0 standings", async () => {
    const from = vi.fn((table: string) =>
      table === "league_settings"
        ? query({ data: { featured_draft_id: "draft-s5" }, error: null })
        : table === "raw_stats"
          ? query({
              data: [
                {
                  game_date: "2026-04-27 20:00:00",
                  match_id: "match-1",
                  team_side: "Blue",
                  team_name: "Alpha",
                  summoner_name: "Ace",
                  tag: "FPL",
                  champion: "Ahri",
                  role: "MIDDLE",
                  kills: 8,
                  deaths: 1,
                  assists: 7,
                  kill_participation_pct: 78,
                  total_damage_to_champions: 25000,
                  cs: 240,
                  gold_earned: 14000,
                  vision_score: 25,
                  win: true,
                  season: "S5",
                  season_phase: "Regular",
                  game_duration_min: 30,
                  team_dragons: 3,
                  team_barons: 1,
                  team_first_blood: true,
                  team_first_tower: true,
                },
              ],
              error: null,
            })
          : query({
            data: [
              { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1 },
              { id: "team-2", name: "Bravo", abbreviation: "BR", nomination_position: 2 },
            ],
            error: null,
          }),
    );
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual([
      {
        id: "season5-alpha",
        name: "Alpha",
        abbreviation: "ALP",
        nomination_position: 1,
        wins: 1,
        losses: 0,
        winrate_pct: 100,
      },
    ]);
  });

  it("ignores historical raw stats when preparing current standings", async () => {
    const from = vi.fn((table: string) =>
      table === "league_settings"
        ? query({ data: { featured_draft_id: "draft-s5" }, error: null })
        : table === "raw_stats"
          ? query({
              data: [
                {
                  game_date: "2026-04-27 20:00:00",
                  match_id: "match-s4",
                  team_side: "Blue",
                  team_name: "Historical Team",
                  win: true,
                  season: "S4",
                },
              ],
              error: null,
            })
          : query({ data: [{ id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1 }], error: null }),
    );
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual([
      { id: "team-1", name: "Alpha", abbreviation: "AL", nomination_position: 1, wins: 0, losses: 0 },
    ]);
  });

  it("returns no rows when no draft is featured", async () => {
    const from = vi.fn(() => query({ data: { featured_draft_id: null }, error: null }));
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual([]);
  });

  it("returns no rows when local settings have not been seeded", async () => {
    const from = vi.fn(() =>
      query({
        data: null,
        error: { code: "PGRST116", message: "The result contains 0 rows" },
      }),
    );
    createServerSupabase.mockResolvedValue({ from });

    await expect(fetchHomepageStandings()).resolves.toEqual([]);
  });
});
