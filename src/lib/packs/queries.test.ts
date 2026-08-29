import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchInventory } from "./queries";

/**
 * Enough of PostgREST's builder to reproduce the thing that broke: a
 * response capped at max_rows, served with no error and no marker. `range`
 * serves the slice a real API would, so a caller that fails to page sees
 * exactly the silent truncation production had.
 */
const PAGE = 1000;

function client(rows: unknown[], calls: number[][] = []): SupabaseClient {
  return {
    from() {
      const chain: Record<string, unknown> = {};
      for (const method of ["select", "eq", "order"]) chain[method] = () => chain;
      chain.range = (from: number, to: number) => {
        calls.push([from, to]);
        return Promise.resolve({ data: rows.slice(from, Math.min(to + 1, from + PAGE)), error: null });
      };
      chain.then = (resolve: (value: unknown) => unknown) =>
        Promise.resolve({ data: [], error: null }).then(resolve);
      return chain;
    },
  } as unknown as SupabaseClient;
}

function row(id: number) {
  return {
    id,
    season: "S5",
    slug: `p-${id}`,
    player_name: `Player ${id}`,
    role: "Mid",
    edition_week: "2026-08-24",
    overall: 70,
    tier: "gold",
    foil: false,
    foil_type: null,
    signed: null,
    // teamName absent, so the badge repair never fires and the fixture
    // doesn't have to answer a teams lookup as well.
    card: { slug: `p-${id}`, name: `Player ${id}` },
    pack_open_id: null,
    acquired_at: "2026-08-24T00:00:00.000Z",
  };
}

describe("fetchInventory", () => {
  it("pages past the row cap instead of returning the first thousand copies", async () => {
    // The shipped bug: a collector past a thousand copies had an expedition
    // in the field rendering two of its three cards as `#2317` and a `?`,
    // because the run's squad was real and this read had stopped short.
    const rows = await fetchInventory(client(Array.from({ length: 2350 }, (_, i) => row(i + 1))), "42", "S5");

    expect(rows).toHaveLength(2350);
    expect(rows[rows.length - 1].id).toBe(2350);
  });

  it("asks one more time on an exact page boundary, then stops", async () => {
    // A collection of exactly two full pages: the second page comes back
    // full, so the only way to know there is no third is to ask. Stopping
    // there is what keeps a full page from looping forever.
    const calls: number[][] = [];
    const rows = await fetchInventory(
      client(Array.from({ length: 2000 }, (_, i) => row(i + 1)), calls),
      "42",
      "S5",
    );

    expect(rows).toHaveLength(2000);
    expect(calls).toEqual([
      [0, 999],
      [1000, 1999],
      [2000, 2999],
    ]);
  });

  it("makes byte-identical cards share one object, so they serialize once", async () => {
    // Four copies of one print used to cross the wire as four copies of the
    // same ~1.2 KB of json — and a signed copy carries an inked PNG inline,
    // so a handful of those outweigh a thousand plain cards. Repeat
    // references serialize as back-references; equal cards now share one.
    const rows = await fetchInventory(
      client([row(1), row(2), row(3)].map((r) => ({ ...r, card: { slug: "same", name: "Same" } }))),
      "42",
      "S5",
    );

    expect(rows).toHaveLength(3);
    expect(rows[0].card).toBe(rows[1].card);
    expect(rows[1].card).toBe(rows[2].card);
  });

  it("never merges cards that differ, however slightly", async () => {
    // Keyed on the serialized card, so two prints cannot be collapsed by a
    // key that forgot to include whatever makes them different.
    const rows = await fetchInventory(
      client([
        { ...row(1), card: { slug: "p", artSkin: 0 } },
        { ...row(2), card: { slug: "p", artSkin: 3 } },
      ]),
      "42",
      "S5",
    );

    expect(rows[0].card).not.toBe(rows[1].card);
  });

  it("reads an empty collection as empty, not as an error", async () => {
    expect(await fetchInventory(client([]), "42", "S5")).toEqual([]);
  });
});
