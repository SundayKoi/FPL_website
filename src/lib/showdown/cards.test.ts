import { describe, expect, it } from "vitest";
import type { InventoryRow } from "@/lib/packs/queries";
import { cardFromEdition, cardFromInventory, dealHouseStack, stackTotal } from "./cards";
import { BRACKETS, STACK_SIZE } from "./config";
import type { ShowdownCard } from "./hands";

const row = (overrides: Partial<InventoryRow> & { card?: Partial<InventoryRow["card"]> } = {}): InventoryRow =>
  ({
    id: 7,
    season: "S5",
    slug: "doug-na1",
    playerName: "Doug",
    role: "MIDDLE",
    editionWeek: "2026-08-31",
    overall: 88,
    tier: "diamond",
    foil: true,
    foilType: "aurora",
    signed: false,
    packOpenId: null,
    acquiredAt: "",
    printNumber: 3,
    ...overrides,
    card: { name: "Doug", role: "Mid", teamName: "Gamblers", tier: { key: "diamond", label: "Diamond" }, overall: 88, slug: "doug-na1", ...(overrides.card ?? {}) } as InventoryRow["card"],
  }) as InventoryRow;

describe("cards for the engine", () => {
  it("reads a copy you own by its inventory id, so two copies are two cards", () => {
    const card = cardFromInventory(row());
    expect(card).toEqual({ id: "7", art: "/copy/7/card.png", name: "Doug", role: "Mid", team: "Gamblers", tier: "diamond", overall: 88, foil: true });
    expect(cardFromInventory(row({ id: 8 })).id).toBe("8");
  });

  it("falls back to the raw role mode and a bronze tier when the frozen card is thin", () => {
    const thin = {
      ...row(),
      card: { name: "Doug", role: undefined, teamName: "Gamblers", tier: { key: "mythic", label: "?" }, overall: 88, slug: "doug-na1" } as unknown as InventoryRow["card"],
    };
    const card = cardFromInventory(thin);
    expect(card.role).toBe("Mid");
    expect(card.tier).toBe("bronze");
  });

  it("stamps an edition card with its week so the same player from two weeks stays two cards", () => {
    const card = cardFromEdition(row().card, "2026-08-31");
    expect(card.id).toBe("doug-na1@2026-08-31");
    expect(card.art).toBe("/card/doug-na1/card.png?w=2026-08-31");
    expect(cardFromEdition(row().card, "2026-09-07").id).not.toBe(card.id);
    expect(card.foil).toBe(false);
  });
});

describe("the house stack", () => {
  const edition: ShowdownCard[] = Array.from({ length: 30 }, (_, i) => ({
    id: `e${i}`,
    role: "Mid",
    team: `T${i % 6}`,
    tier: "gold",
    overall: 50 + i * 2, // 50 .. 108
    foil: false,
  }));

  it("deals ten cards under the cap by swapping the heaviest for the lightest left out", () => {
    // rand = 0.99 pulls the heaviest cards first, so the swap has work to do.
    const stack = dealHouseStack(edition, BRACKETS.open, () => 0.99)!;
    expect(stack).toHaveLength(STACK_SIZE);
    expect(stackTotal(stack)).toBeLessThanOrEqual(BRACKETS.open.stackCap);
    expect(new Set(stack.map((card) => card.id)).size).toBe(STACK_SIZE);
  });

  it("gives up when even the lightest ten cannot fit, and on a thin edition", () => {
    const heavy = edition.map((card) => ({ ...card, overall: 99 }));
    expect(dealHouseStack(heavy, BRACKETS.low, () => 0.5)).toBeNull();
    expect(dealHouseStack(edition.slice(0, 5), BRACKETS.low, () => 0.5)).toBeNull();
  });
});
