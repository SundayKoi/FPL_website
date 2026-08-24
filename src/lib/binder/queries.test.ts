import { describe, expect, it, vi } from "vitest";
import { fetchBinderByToken } from "./queries";
import type { SupabaseClient } from "@supabase/supabase-js";

const TOKEN = "11111111-2222-3333-4444-555555555555";

/** Enough of PostgREST's builder to answer the three reads the binder does,
 *  keyed by table. */
function client(tables: Record<string, unknown>): SupabaseClient {
  return {
    from(table: string) {
      const result = tables[table] ?? { data: null, error: null };
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order"]) {
        chain[method] = () => chain;
      }
      chain.maybeSingle = async () => result;
      chain.then = (resolve: (value: unknown) => unknown) => Promise.resolve(result).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

describe("fetchBinderByToken", () => {
  it("rejects a malformed token without querying at all", async () => {
    const from = vi.fn();
    const supabase = { from } as unknown as SupabaseClient;
    // Postgres errors on a bad uuid rather than returning no rows, so this
    // has to be caught before the query.
    expect(await fetchBinderByToken(supabase, "not-a-uuid")).toBeNull();
    expect(from).not.toHaveBeenCalled();
  });

  it("returns null for a token nobody holds", async () => {
    const supabase = client({ card_binders: { data: null, error: null } });
    expect(await fetchBinderByToken(supabase, TOKEN)).toBeNull();
  });

  it("drops pins on copies the owner has since traded away", async () => {
    const supabase = client({
      card_binders: { data: { discord_id: "u1", token: TOKEN, title: "Shelf" }, error: null },
      card_binder_slots: {
        data: [
          {
            slot: 1,
            inventory_id: 10,
            card_inventory: {
              discord_id: "u1",
              player_name: "Ari",
              edition_week: "2026-08-17",
              tier: "gold",
              foil: true,
              signed: null,
              card: { slug: "ari" },
            },
          },
          {
            slot: 2,
            inventory_id: 11,
            // Traded to someone else since it was pinned.
            card_inventory: { discord_id: "u2", player_name: "Bo", edition_week: "", tier: "silver", foil: false, signed: null, card: {} },
          },
        ],
        error: null,
      },
      betting_profiles: { data: { username: "Zed", avatar_url: null }, error: null },
    });

    const binder = await fetchBinderByToken(supabase, TOKEN);
    expect(binder?.title).toBe("Shelf");
    expect(binder?.ownerName).toBe("Zed");
    expect(binder?.cards.map((entry) => entry.playerName)).toEqual(["Ari"]);
    expect(binder?.cards[0].signed).toBe(false);
  });
});
