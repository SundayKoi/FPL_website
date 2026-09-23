import { describe, expect, it } from "vitest";
import { seasonEndDuplicateIds } from "./autoDust";
import type { SeasonEndOwnedCopy } from "./release-queries";

function copy(inventoryId: number, overrides: Partial<SeasonEndOwnedCopy> = {}): SeasonEndOwnedCopy {
  return { inventoryId, releaseId: "r1", openingId: "o1", designId: "d1", slotPosition: 1, revealOrder: 1, lifecycleStatus: "active", foil: false, foilType: null, signed: false, autograph: null, payload: {} as never, economyVersion: "v1", rulesVersion: "v1", ...overrides };
}

describe("Season's End exact duplicates", () => {
  it("keeps the oldest active copy of each release, design, foil finish, and signature", () => {
    expect(seasonEndDuplicateIds([
      copy(4, { foil: true, foilType: "prisma" }),
      copy(2),
      copy(5, { signed: true }),
      copy(1),
      copy(3, { foil: true, foilType: "prisma" }),
      copy(6, { foil: true, foilType: "aurora" }),
      copy(7, { releaseId: "r2" }),
      copy(8, { designId: "d2" }),
    ])).toEqual([2, 4]);
  });
});
