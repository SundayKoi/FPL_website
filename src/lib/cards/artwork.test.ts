import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { canonicalArtChampion, fetchPlayedChampions, isPlayedChampion } from "./artwork";

function clientFor(rows: { champion: string | null }[], error: unknown = null): SupabaseClient {
  const calls: string[] = [];
  const query = {
    select: (value: string) => { calls.push(`select:${value}`); return query; },
    eq: (column: string, value: string) => { calls.push(`eq:${column}=${value}`); return query; },
    not: (column: string, operator: string, value: string) => { calls.push(`not:${column}:${operator}:${value}`); return query; },
    order: (column: string) => { calls.push(`order:${column}`); return query; },
    range: () => Promise.resolve({ data: rows, error }),
  };
  return {
    from: () => query,
    __calls: calls,
  } as unknown as SupabaseClient;
}

describe("Season Card artwork eligibility", () => {
  it("canonicalizes Data Dragon aliases without changing display names", () => {
    expect(canonicalArtChampion("MonkeyKing")).toBe("Wukong");
    expect(canonicalArtChampion("Kai'Sa")).toBe("Kai'Sa");
    expect(canonicalArtChampion(" Ahri ")).toBe("Ahri");
  });

  it("returns every played champion, including one-game champions, with counts", async () => {
    const client = clientFor([
      { champion: "MonkeyKing" },
      { champion: "Wukong" },
      { champion: "Lux" },
      { champion: null },
    ]);
    const result = await fetchPlayedChampions(client, "S5", "Player", "NA1");

    expect(result).toEqual({
      available: true,
      champions: [
        { champion: "Wukong", games: 2 },
        { champion: "Lux", games: 1 },
      ],
    });
    expect((client as unknown as { __calls: string[] }).__calls).toEqual(expect.arrayContaining([
      "eq:season=S5",
      "eq:summoner_name=Player",
      "eq:tag=NA1",
      "order:id",
    ]));
  });

  it("fails closed when the participation query fails and matches canonical aliases", async () => {
    const result = await fetchPlayedChampions(clientFor([], new Error("offline")), "S5", "Player", "NA1");
    expect(result).toEqual({ available: false, champions: [] });
    expect(isPlayedChampion([{ champion: "Wukong", games: 1 }], "MonkeyKing")).toBe(true);
    expect(isPlayedChampion([{ champion: "Wukong", games: 1 }], "Ahri")).toBe(false);
  });
});
