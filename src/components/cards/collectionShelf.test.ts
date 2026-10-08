import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import type { InventoryRow } from "@/lib/packs/queries";
import { printRunKey } from "@/lib/packs/printRuns";
import { shelfEntries } from "./collectionShelf";

function copy(id: number, overrides: Partial<InventoryRow> = {}): InventoryRow {
  return {
    id, season: "S5", slug: "doug-na1", playerName: "Doug", role: "Mid",
    editionWeek: "2026-08-24", overall: 80, tier: "emerald", foil: false,
    foilType: null, signed: false, card: { artSkin: 0 } as PlayerCardData,
    packOpenId: null, acquiredAt: "2026-08-25T00:00:00Z", printNumber: id,
    mutation: null, ...overrides,
  };
}

describe("collapsed collection shelf", () => {
  it("keeps Eclipse, signed and alternate prints separate and preserves every owned copy", () => {
    const rows = [
      copy(1), copy(2, { overall: 90 }), copy(3, { signed: true }),
      copy(4, { foil: true, foilType: "eclipse", signed: true }),
      copy(5, { card: { artSkin: 1 } as PlayerCardData }),
    ];
    const original = structuredClone(rows);
    const [entry] = shelfEntries(rows, "best", new Map([[printRunKey("2026-08-24", "doug-na1"), 15]]));
    expect(entry.best.id).toBe(4);
    expect(entry.count).toBe(5);
    expect(entry.eclipses).toBe(1);
    expect(entry.foils).toBe(0);
    expect(entry.signatures).toBe(2);
    expect(entry.prints.map(({ copy, count }) => [copy.id, count])).toEqual([[4, 1], [3, 1], [2, 2], [5, 1]]);
    expect(entry.copies.map(({ id, printRun }) => [id, printRun])).toEqual([[1, 15], [2, 15], [3, 15], [4, 15], [5, 15]]);
    expect(rows).toEqual(original);
  });

  it("groups by full slug and retains the requested shelf and edition order", () => {
    const rows = [copy(1, { editionWeek: "2026-08-17" }), copy(2), copy(3, { slug: "doug-eu", overall: 99 })];
    const entries = shelfEntries(rows, "rating");
    expect(entries.map(({ best }) => best.slug)).toEqual(["doug-eu", "doug-na1"]);
    expect(entries[1].editions).toEqual(["2026-08-17", "2026-08-24"]);
    expect(entries[1].copies.map(({ id }) => id)).toEqual([1, 2]);
  });
});
