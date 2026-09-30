import type { SeasonEndOwnedCopy } from "@/lib/season-end/release-queries";

export function money(value: number): string {
  return value.toLocaleString("en-US");
}

export function copyPull(copy: SeasonEndOwnedCopy) {
  return {
    design: copy.payload,
    foil: copy.foil,
    foilType: copy.foilType as never,
    signed: copy.signed,
    autograph: copy.autograph,
    guaranteedFoil: copy.slotPosition === 5,
    inventoryId: copy.inventoryId,
  };
}
