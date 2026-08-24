import { describe, expect, it } from "vitest";
import { excludedCollectorNames, fetchEconomyStats, DEFAULT_EXCLUDED_COLLECTORS } from "./economy";
import type { SupabaseClient } from "@supabase/supabase-js";

/** Enough of PostgREST's builder for the three reads this module makes. */
function client(tables: Record<string, { data?: unknown; error?: unknown; count?: number }>): SupabaseClient {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: [], error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq"]) chain[method] = () => chain;
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

const PROFILES = {
  data: [
    { discord_id: "dev1", username: "Dribb" },
    { discord_id: "dev2", username: "spiesss" },
    { discord_id: "u1", username: "Ari" },
    { discord_id: "u2", username: "Bo" },
  ],
  error: null,
};

function card(discord_id: string, overrides: Record<string, unknown> = {}) {
  return {
    discord_id,
    player_name: "Ari",
    overall: 70,
    tier: "gold",
    foil: false,
    signed: null,
    artSkin: 0,
    ...overrides,
  };
}

describe("excludedCollectorNames", () => {
  it("defaults to the two dev accounts", () => {
    expect(excludedCollectorNames(undefined)).toEqual(DEFAULT_EXCLUDED_COLLECTORS);
    expect(excludedCollectorNames("")).toEqual(DEFAULT_EXCLUDED_COLLECTORS);
  });

  it("takes a configured list, trimmed and lowercased", () => {
    expect(excludedCollectorNames(" Foo , BAR ")).toEqual(["foo", "bar"]);
  });
});

describe("fetchEconomyStats", () => {
  it("leaves dev wallets out of every figure", async () => {
    const supabase = client({
      betting_profiles: PROFILES,
      card_pack_opens: {
        data: [
          { discord_id: "dev1", cost: 200 },
          { discord_id: "dev2", cost: 200 },
          { discord_id: "u1", cost: 200 },
        ],
        error: null,
      },
      card_inventory: {
        data: [card("dev1", { foil: true }), card("u1"), card("u2", { signed: true })],
        error: null,
      },
      card_moments: { count: 4, error: null },
    });

    const stats = await fetchEconomyStats(supabase, "S5");
    // One of three opens, and the spend follows it rather than the row count.
    expect(stats.packsOpened).toBe(1);
    expect(stats.spent).toBe(200);
    expect(stats.cardsPulled).toBe(2);
    expect(stats.collectors).toBe(2);
    // The dev's foil must not show up in the rare counts either.
    expect(stats.foils).toBe(0);
    expect(stats.signed).toBe(1);
    expect(stats.excludedCount).toBe(2);
  });

  it("matches excluded names case-insensitively", async () => {
    const supabase = client({
      betting_profiles: PROFILES,
      card_pack_opens: { data: [{ discord_id: "dev1", cost: 200 }], error: null },
      card_inventory: { data: [], error: null },
      card_moments: { count: 0, error: null },
    });
    // "Dribb" in the table, "dribb" in the list.
    expect((await fetchEconomyStats(supabase, "S5")).packsOpened).toBe(0);
  });

  it("counts alternate prints off the frozen json", async () => {
    const supabase = client({
      betting_profiles: PROFILES,
      card_pack_opens: { data: [], error: null },
      card_inventory: { data: [card("u1", { artSkin: 12 }), card("u2", { artSkin: 0 })], error: null },
      card_moments: { count: 0, error: null },
    });
    expect((await fetchEconomyStats(supabase, "S5")).altArts).toBe(1);
  });

  it("names the best pull and the most-pulled player", async () => {
    const supabase = client({
      betting_profiles: PROFILES,
      card_pack_opens: { data: [], error: null },
      card_inventory: {
        data: [
          card("u1", { player_name: "Ari", overall: 91, tier: "master" }),
          card("u1", { player_name: "Bo", overall: 60 }),
          card("u2", { player_name: "Bo", overall: 61 }),
        ],
        error: null,
      },
      card_moments: { count: 0, error: null },
    });

    const stats = await fetchEconomyStats(supabase, "S5");
    expect(stats.bestPull).toEqual({ playerName: "Ari", overall: 91, tier: "master" });
    expect(stats.mostPulled).toEqual({ playerName: "Bo", copies: 2 });
  });

  it("reports zero moments rather than throwing before the migration lands", async () => {
    const supabase = client({
      betting_profiles: PROFILES,
      card_pack_opens: { data: [], error: null },
      card_inventory: { data: [card("u1")], error: null },
      card_moments: { error: { message: "relation does not exist" } },
    });
    expect((await fetchEconomyStats(supabase, "S5")).momentsMinted).toBe(0);
  });
});
