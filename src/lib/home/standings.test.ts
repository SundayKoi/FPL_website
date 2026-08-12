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
        id: "team-1",
        name: "Alpha",
        abbreviation: "AL",
        nomination_position: 1,
        wins: 0,
        losses: 0,
      },
      {
        id: "team-2",
        name: "Bravo",
        abbreviation: "BR",
        nomination_position: 2,
        wins: 0,
        losses: 0,
      },
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
