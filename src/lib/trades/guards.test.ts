import { describe, expect, it } from "vitest";
import type { SupabaseClient } from "@supabase/supabase-js";
import { makeSupabaseFrom, type SupabaseFilterCall } from "@/test-utils/supabaseQuery";
import { inventoryIdsFromSlots, lockedInventoryIds } from "./guards";

describe("inventoryIdsFromSlots", () => {
  it("pulls the inventory id out of every role slot", () => {
    const slots = {
      Top: { inventoryId: 11, slug: "a", playerName: "A", overall: 80, editionWeek: "2026-08-17", foil: false },
      Jungle: { inventoryId: 12, slug: "b", playerName: "B", overall: 70, editionWeek: "2026-08-17", foil: true },
    };

    expect(inventoryIdsFromSlots(slots).sort((a, b) => a - b)).toEqual([11, 12]);
  });

  it("skips anything that isn't a slot carrying an integer id", () => {
    const slots = {
      Top: { inventoryId: 11 },
      Jungle: null,
      Mid: { slug: "no-id" },
      Bot: { inventoryId: "13" },
      Support: { inventoryId: 1.5 },
    };

    expect(inventoryIdsFromSlots(slots)).toEqual([11]);
  });

  it("treats a missing or non-object slots blob as nothing locked", () => {
    expect(inventoryIdsFromSlots(null)).toEqual([]);
    expect(inventoryIdsFromSlots(undefined)).toEqual([]);
    expect(inventoryIdsFromSlots("nope")).toEqual([]);
    expect(inventoryIdsFromSlots({})).toEqual([]);
  });
});

describe("lockedInventoryIds", () => {
  it("collects the ids from every ungraded lineup, scoped to the user and season", async () => {
    const log: SupabaseFilterCall[] = [];
    const from = makeSupabaseFrom(
      {
        fantasy_lineups: [
          {
            data: [
              { slots: { Top: { inventoryId: 11 }, Mid: { inventoryId: 12 } } },
              { slots: { Top: { inventoryId: 12 }, Bot: { inventoryId: 13 } } },
            ],
          },
        ],
      },
      log,
    );

    const locked = await lockedInventoryIds({ from } as unknown as SupabaseClient, "42", "S5");

    expect([...locked].sort((a, b) => a - b)).toEqual([11, 12, 13]);
    // ungraded only — a scored week denormalizes its cards and locks nothing
    expect(log).toContainEqual({ table: "fantasy_lineups", method: "is", args: ["scored_at", null] });
    expect(log).toContainEqual({ table: "fantasy_lineups", method: "eq", args: ["discord_id", "42"] });
    expect(log).toContainEqual({ table: "fantasy_lineups", method: "eq", args: ["season", "S5"] });
  });

  it("locks nothing when the read fails", async () => {
    const from = makeSupabaseFrom({ fantasy_lineups: [{ data: null, error: { message: "no table" } }] });

    expect(await lockedInventoryIds({ from } as unknown as SupabaseClient, "42", "S5")).toEqual(new Set());
  });
});
