import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSupabaseFrom } from "@/test-utils/supabaseQuery";
import { fetchCollectors, fetchTradesFor } from "./queries";

function card(id: number, owner: string, name: string) {
  return {
    id,
    discord_id: owner,
    season: "S5",
    slug: name.toLowerCase(),
    player_name: name,
    role: "Mid",
    edition_week: "2026-08-17",
    overall: 80,
    tier: "diamond",
    foil: false,
    signed: false,
    card: { name },
  };
}

const incomingTrade = {
  id: 1,
  season: "S5",
  from_discord: "99",
  to_discord: "42",
  offered_inventory_ids: [11],
  requested_inventory_ids: [21],
  offered_dollars: 500,
  requested_dollars: 0,
  status: "pending",
  created_at: "2026-08-20T10:00:00Z",
  decided_at: null,
};

const decidedTrade = {
  ...incomingTrade,
  id: 2,
  status: "accepted",
  created_at: "2026-08-21T10:00:00Z",
  decided_at: "2026-08-21T11:00:00Z",
};

function client(responses: Parameters<typeof makeSupabaseFrom>[0]) {
  return { from: makeSupabaseFrom(responses) } as unknown as SupabaseClient;
}

describe("fetchTradesFor", () => {
  it("hydrates both sides and names both parties", async () => {
    const supabase = client({
      card_trades: [{ data: [incomingTrade] }, { data: [] }],
      card_inventory: [{ data: [card(11, "99", "Giver"), card(21, "42", "Taker")] }],
      betting_profiles: [{ data: [{ discord_id: "99", username: "Nina" }, { discord_id: "42", username: "Zed" }] }],
    });

    const { incoming, outgoing } = await fetchTradesFor(supabase, "42", "S5");

    expect(outgoing).toEqual([]);
    expect(incoming).toHaveLength(1);
    expect(incoming[0].fromUsername).toBe("Nina");
    expect(incoming[0].toUsername).toBe("Zed");
    expect(incoming[0].offered[0].playerName).toBe("Giver");
    expect(incoming[0].requested[0].playerName).toBe("Taker");
    expect(incoming[0].offeredDollars).toBe(500);
    expect(incoming[0].stale).toBe(false);
  });

  it("flags a pending trade whose card was dusted or moved on", async () => {
    const supabase = client({
      // card 11 has changed hands since the offer; card 21 is gone entirely
      card_trades: [{ data: [incomingTrade] }, { data: [] }],
      card_inventory: [{ data: [card(11, "somebody-else", "Giver")] }],
      betting_profiles: [{ data: [] }],
    });

    const { incoming } = await fetchTradesFor(supabase, "42", "S5");

    expect(incoming[0].stale).toBe(true);
    expect(incoming[0].offered[0].stale).toBe(true);
    // the missing copy is a gap in the list, not a silently shorter offer
    expect(incoming[0].requested).toHaveLength(1);
    expect(incoming[0].requested[0].card).toBeNull();
    // no username row: the raw discord id is the fallback name
    expect(incoming[0].fromUsername).toBe("99");
  });

  it("never flags a settled trade as stale — those cards moved on purpose", async () => {
    const supabase = client({
      card_trades: [{ data: [decidedTrade] }, { data: [] }],
      card_inventory: [{ data: [card(11, "42", "Giver"), card(21, "99", "Taker")] }],
      betting_profiles: [{ data: [] }],
    });

    const { incoming } = await fetchTradesFor(supabase, "42", "S5");

    expect(incoming[0].stale).toBe(false);
  });

  it("sorts pending offers ahead of decided ones", async () => {
    const supabase = client({
      // handed back newest-first, and the newest is already settled
      card_trades: [{ data: [decidedTrade, incomingTrade] }, { data: [] }],
      card_inventory: [{ data: [] }],
      betting_profiles: [{ data: [] }],
    });

    const { incoming } = await fetchTradesFor(supabase, "42", "S5");

    expect(incoming.map((trade) => trade.id)).toEqual([1, 2]);
  });

  it("reads as no trades when the table isn't there", async () => {
    const supabase = client({ card_trades: [{ data: null, error: { message: "no table" } }] });

    expect(await fetchTradesFor(supabase, "42", "S5")).toEqual({ incoming: [], outgoing: [] });
  });
});

describe("fetchCollectors", () => {
  it("counts each owner's cards, biggest collection first", async () => {
    const supabase = client({
      card_inventory: [{ data: [{ discord_id: "42" }, { discord_id: "99" }, { discord_id: "42" }] }],
      betting_profiles: [{ data: [{ discord_id: "42", username: "Zed" }] }],
    });

    expect(await fetchCollectors(supabase, "S5")).toEqual([
      { discordId: "42", username: "Zed", cards: 2 },
      // no profile row: falls back to the id rather than dropping the owner
      { discordId: "99", username: "99", cards: 1 },
    ]);
  });

  it("returns nobody when the season has no cards", async () => {
    expect(await fetchCollectors(client({ card_inventory: [{ data: [] }] }), "S5")).toEqual([]);
  });

  it("pages past PostgREST's row cap so late owners still appear", async () => {
    // The bug this guards: a single unpaginated select returns max_rows with
    // no error, so an owner whose only rows sit past the cap silently drops
    // out of the trade dropdown — they look like they own nothing at all.
    const PAGE = 1000;
    const rows = [
      ...Array.from({ length: PAGE }, () => ({ discord_id: "early-collector" })),
      { discord_id: "solomon" },
    ];
    // A client that serves real slices, the way PostgREST would.
    const paging = {
      from: (table: string) => {
        const chain: Record<string, unknown> = {};
        for (const method of ["select", "eq", "in", "order"]) chain[method] = () => chain;
        chain.range = (from: number, to: number) =>
          Promise.resolve({
            data:
              table === "card_inventory"
                ? rows.slice(from, Math.min(to + 1, from + PAGE))
                : [{ discord_id: "solomon", username: "Solomon" }],
            error: null,
          });
        // Awaiting without range() is the production bug in miniature:
        // PostgREST hands back its max_rows slice and no error at all.
        chain.then = (resolve: (v: { data: unknown; error: null }) => unknown) =>
          Promise.resolve({
            data:
              table === "card_inventory"
                ? rows.slice(0, PAGE)
                : [{ discord_id: "solomon", username: "Solomon" }],
            error: null,
          }).then(resolve);
        return chain;
      },
    } as unknown as SupabaseClient;

    const collectors = await fetchCollectors(paging, "S5");

    expect(collectors.map((c) => c.discordId)).toContain("solomon");
  });
});
