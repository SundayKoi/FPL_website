import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import PlayersPage from "./page";

const { createServerSupabase } = vi.hoisted(() => ({
  createServerSupabase: vi.fn(),
}));

vi.mock("@/lib/supabase/server", () => ({ createServerSupabase }));

function orderableQuery(result: unknown) {
  const builder = {
    select: () => builder,
    eq: () => builder,
    order: () => builder,
    then: (onFulfilled: (value: unknown) => unknown) => Promise.resolve(result).then(onFulfilled),
  };
  return builder;
}

describe("PlayersPage", () => {
  afterEach(cleanup);
  afterEach(() => {
    createServerSupabase.mockReset();
  });

  it("renders canonical player-pool rows with exact op.gg links", async () => {
    const from = vi.fn((table: string) => {
      if (table === "player_pool") {
        const query = orderableQuery({
          data: [
            {
              season_key: "season-5",
              display_name: "RiftMaker#NA1",
              role: "top",
              rank: "D1",
              opgg_url: "https://op.gg/lol/summoners/na/RiftMaker-NA1?exact=1",
            },
            {
              season_key: "season-5",
              display_name: "WaveClear#NA1",
              role: "support",
              rank: "E2",
              opgg_url: "https://op.gg/lol/summoners/na/WaveClear-NA1",
            },
          ],
          error: null,
        });
        query.eq = vi.fn(() => query);
        return query;
      }

      if (table === "free_agency_avg_bids") {
        return { select: async () => ({ data: [], error: null }) };
      }

      return { select: async () => ({ data: null, error: null }) };
    });

    createServerSupabase.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from,
    });

    render(await PlayersPage());

    expect(from).toHaveBeenCalledWith("player_pool");
    const playerPoolQuery = from.mock.results.find((result) => result.value?.eq)?.value;
    expect(playerPoolQuery.eq).toHaveBeenCalledWith("season_key", "season-5");

    expect(screen.getByRole("heading", { name: "Players", level: 1 })).toBeTruthy();
    expect(screen.getByRole("option", { name: "Season 5" })).toBeTruthy();
    expect(screen.getByRole("link", { name: "RiftMaker#NA1" }).getAttribute("href")).toBe(
      "https://op.gg/lol/summoners/na/RiftMaker-NA1?exact=1",
    );
    expect(screen.queryByRole("link", { name: "Captain: Winter" })).toBeNull();
  });

  it("shows a clear unavailable state when canonical Season 5 rows are missing", async () => {
    const from = vi.fn((table: string) => {
      if (table === "player_pool") {
        const query = orderableQuery({ data: [], error: null });
        query.eq = vi.fn(() => query);
        return query;
      }

      if (table === "free_agency_avg_bids") {
        return { select: async () => ({ data: [], error: null }) };
      }

      return { select: async () => ({ data: null, error: null }) };
    });

    createServerSupabase.mockResolvedValue({
      auth: { getUser: async () => ({ data: { user: null } }) },
      from,
    });

    render(await PlayersPage());

    expect(screen.getByText("Player List data is unavailable for Season 5 right now.")).toBeTruthy();
  });
});
