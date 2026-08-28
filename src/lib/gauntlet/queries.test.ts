import { describe, expect, it } from "vitest";
import type { InventoryRow } from "@/lib/packs/queries";
import { buildGauntletOptions, DRAFT_STAT_KEYS } from "./queries";

const row = (over: Partial<InventoryRow> = {}): InventoryRow =>
  ({
    id: 1,
    season: "S4",
    slug: "someone-tag",
    playerName: "Someone",
    role: "Mid",
    editionWeek: "2026-08-24",
    overall: 78,
    tier: "gold",
    foil: false,
    foilType: null,
    signed: false,
    card: {
      subStats: [
        { key: "laning", label: "Laning", value: 81 },
        { key: "combat", label: "Combat", value: 74 },
        { key: "damage", label: "Damage", value: 88 },
        { key: "turrets", label: "Turrets", value: 66 },
      ],
    },
    packOpenId: null,
    ...over,
  }) as unknown as InventoryRow;

describe("buildGauntletOptions", () => {
  it("tags which shelf each copy came off, defaulting to premier", () => {
    // Both leagues field, and an academy 80 is rated against a different
    // set of players than a premier 80 — so the draft screen has to be
    // able to say which is which.
    const leagues = new Map([
      ["S4", "premier" as const],
      ["ACA4", "academy" as const],
    ]);
    const options = buildGauntletOptions(
      [row({ id: 1 }), row({ id: 2, season: "ACA4", playerName: "Rookie" })],
      "2026-08-24",
      leagues,
    );
    expect(options.Mid.find((option) => option.inventoryId === 1)?.league).toBe("premier");
    expect(options.Mid.find((option) => option.inventoryId === 2)?.league).toBe("academy");
    // A single-league environment passes no map at all and still works.
    expect(buildGauntletOptions([row()], "2026-08-24").Mid[0].league).toBe("premier");
  });

  it("ships each option's draft bars — and only the draft bars", () => {
    const options = buildGauntletOptions([row()], "2026-08-24");
    const mid = options.Mid[0];
    expect(mid.stats).toEqual({ laning: 81, combat: 74, damage: 88 });
    // Turrets is real on the card but not a draft-screen key.
    for (const key of Object.keys(mid.stats)) {
      expect(DRAFT_STAT_KEYS).toContain(key);
    }
    expect(mid.fresh).toBe(true);
  });

  it("still benches moments and champions relics", () => {
    const moment = row({ id: 2 });
    (moment.card as { moment?: object }).moment = { kind: "pentakill" };
    const options = buildGauntletOptions([moment], "2026-08-24");
    expect(options.Mid).toHaveLength(0);
  });
});
