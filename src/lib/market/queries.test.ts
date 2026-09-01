import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSupabaseFrom, type SupabaseFilterCall } from "@/test-utils/supabaseQuery";
import {
  fetchListingsBySeller,
  fetchOpenListings,
  fetchOpenWants,
  fetchWantablePlayers,
} from "./queries";

function listing(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 1,
    season: "S5",
    inventory_id: 11,
    seller_discord: "42",
    ask: 500,
    note: "will take offers",
    status: "open",
    created_at: "2026-09-01T10:00:00Z",
    expires_at: "2026-09-15T10:00:00Z",
    decided_at: null,
    buyer_discord: null,
    ...over,
  };
}

function copy(over: Partial<Record<string, unknown>> = {}) {
  return {
    id: 11,
    discord_id: "42",
    season: "S5",
    slug: "doug-na1",
    player_name: "Doug",
    role: "Mid",
    edition_week: "2026-08-24",
    overall: 88,
    tier: "master",
    foil: true,
    foil_type: "ice",
    signed: false,
    card: { name: "Doug", artSkin: 2 },
    ...over,
  };
}

function client(responses: Parameters<typeof makeSupabaseFrom>[0], log?: SupabaseFilterCall[]) {
  return { from: makeSupabaseFrom(responses, log) } as unknown as SupabaseClient;
}

describe("fetchOpenListings", () => {
  it("hydrates the copy and names the seller", async () => {
    const supabase = client({
      card_listings: [{ data: [listing()] }],
      card_inventory: [{ data: [copy()] }],
      betting_profiles: [{ data: [{ discord_id: "42", username: "Zed" }] }],
    });

    const [row] = await fetchOpenListings(supabase, "S5");

    expect(row.sellerUsername).toBe("Zed");
    expect(row.ask).toBe(500);
    expect(row.copy?.playerName).toBe("Doug");
    expect(row.copy?.foilType).toBe("ice");
    // The alternate-print roll only exists on the frozen json, so it has to be
    // reduced server-side or the board cannot mark it.
    expect(row.copy?.altArt).toBe(true);
    expect(row.stale).toBe(false);
  });

  it("hides listings that have already lapsed", async () => {
    // Nothing sweeps expires_at, so the filter is the board's own job. Proven
    // through the recorded filter calls rather than through fixture data,
    // because the mock does not evaluate predicates.
    const log: SupabaseFilterCall[] = [];
    const supabase = client({ card_listings: [{ data: [] }] }, log);

    await fetchOpenListings(supabase, "S5", new Date("2026-09-10T00:00:00Z"));

    const gt = log.find((call) => call.table === "card_listings" && call.method === "gt");
    expect(gt?.args).toEqual(["expires_at", "2026-09-10T00:00:00.000Z"]);
  });

  it("pages on id, which is the only total order the table has", async () => {
    const log: SupabaseFilterCall[] = [];
    const supabase = client({ card_listings: [{ data: [] }] }, log);

    await fetchOpenListings(supabase, "S5");

    const order = log.filter((call) => call.table === "card_listings" && call.method === "order");
    expect(order).toHaveLength(1);
    expect(order[0].args[0]).toBe("id");
    const range = log.find((call) => call.table === "card_listings" && call.method === "range");
    expect(range?.args).toEqual([0, 999]);
  });

  it("marks a listing stale when the copy has left the seller", async () => {
    // buy_card_listing would raise 'card not owned'; the board says so first.
    const supabase = client({
      card_listings: [{ data: [listing()] }],
      card_inventory: [{ data: [copy({ discord_id: "99" })] }],
      betting_profiles: [{ data: [{ discord_id: "42", username: "Zed" }] }],
    });

    const [row] = await fetchOpenListings(supabase, "S5");

    expect(row.stale).toBe(true);
  });

  it("keeps a listing whose copy was dusted, as a gap rather than a hole", async () => {
    const supabase = client({
      card_listings: [{ data: [listing()] }],
      card_inventory: [{ data: [] }],
      betting_profiles: [{ data: [] }],
    });

    const [row] = await fetchOpenListings(supabase, "S5");

    expect(row.copy).toBeNull();
    expect(row.stale).toBe(true);
    // Unresolvable names fall back to the id rather than to "undefined".
    expect(row.sellerUsername).toBe("42");
  });

  it("reads an error as an empty board rather than throwing", async () => {
    const supabase = client({ card_listings: [{ data: null, error: { message: "no such table" } }] });

    expect(await fetchOpenListings(supabase, "S5")).toEqual([]);
  });
});

describe("fetchListingsBySeller", () => {
  it("puts open listings first and names the buyer of a sold one", async () => {
    const sold = listing({ id: 2, status: "sold", buyer_discord: "99", decided_at: "2026-09-02T10:00:00Z" });
    const supabase = client({
      card_listings: [{ data: [sold, listing()] }],
      card_inventory: [{ data: [copy()] }],
      betting_profiles: [
        { data: [{ discord_id: "42", username: "Zed" }, { discord_id: "99", username: "Nina" }] },
      ],
    });

    const rows = await fetchListingsBySeller(supabase, "42", "S5");

    expect(rows.map((row) => row.status)).toEqual(["open", "sold"]);
    expect(rows[1].buyerUsername).toBe("Nina");
    // A sold listing is not stale — the copy changed hands legitimately.
    expect(rows[1].stale).toBe(false);
  });
});

describe("fetchOpenWants", () => {
  it("hydrates the poster's name", async () => {
    const supabase = client({
      card_wants: [
        {
          data: [
            {
              id: 7,
              season: "S5",
              discord_id: "99",
              slug: "spies-na1",
              bounty: 800,
              note: null,
              status: "open",
              created_at: "2026-09-01T10:00:00Z",
              decided_at: null,
              filled_inventory_id: null,
              filled_by: null,
            },
          ],
        },
      ],
      betting_profiles: [{ data: [{ discord_id: "99", username: "Nina" }] }],
    });

    const [want] = await fetchOpenWants(supabase, "S5");

    expect(want.username).toBe("Nina");
    expect(want.bounty).toBe(800);
  });
});

describe("fetchWantablePlayers", () => {
  it("names every player in the newest archived week, by name", async () => {
    const supabase = client({
      card_editions: [
        { data: [{ edition_week: "2026-08-31" }] },
        {
          data: [
            { slug: "spies-na1", name: "Spies" },
            { slug: "doug-na1", name: "Doug" },
          ],
        },
      ],
    });

    expect(await fetchWantablePlayers(supabase, "S5")).toEqual([
      { slug: "doug-na1", name: "Doug" },
      { slug: "spies-na1", name: "Spies" },
    ]);
  });

  it("falls back to the cards people actually hold when no week is archived", async () => {
    // A league that has never run a weekly drop still needs a want form that
    // does something.
    const supabase = client({
      card_editions: [{ data: [] }],
      card_inventory: [
        {
          data: [
            { id: 1, slug: "kite-na1", player_name: "Kite" },
            { id: 2, slug: "kite-na1", player_name: "Kite" },
          ],
        },
      ],
    });

    expect(await fetchWantablePlayers(supabase, "S5")).toEqual([{ slug: "kite-na1", name: "Kite" }]);
  });
});
