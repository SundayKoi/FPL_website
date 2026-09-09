import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { TIER_ORDER, shineOf, type CardCopy } from "./config";
import {
  MILES_BY_TIER,
  TRAIL_TITLES,
  VETERAN_MILES,
  WAYFARER_MILES,
  WAYFARER_SHINE,
  isVeteran,
  isWayfarer,
  milesOf,
  nextTrailTitle,
  trailLine,
  trailTitleFor,
} from "./trail";

const copy = (miles: number | null, over: Partial<Record<keyof CardCopy, unknown>> = {}) =>
  ({ id: 1, tier: "gold", foil: false, foilType: null, signed: false, role: "Mid", playerName: "Card", card: miles === null ? {} : { trail: { miles, runs: 1, deepest: "raid" } }, ...over }) as unknown as CardCopy;

describe("trail miles", () => {
  it("holds the SQL's miles table and the config's to the same numbers", () => {
    // The trigger that stamps miles (20261010000001) carries its own
    // table; a threshold moved in one place and not the other would
    // title cards the database never paid for.
    const sql = readFileSync(join(process.cwd(), "supabase/migrations/20261010000001_expedition_trail_miles.sql"), "utf8");
    for (const tier of TIER_ORDER) {
      const match = sql.match(new RegExp(`when '${tier}' then (\\d+)`));
      const inSql = match ? Number(match[1]) : 0;
      expect(inSql, `${tier} in SQL`).toBe(MILES_BY_TIER[tier]);
    }
    expect(MILES_BY_TIER.exorcism).toBe(0);
    expect(MILES_BY_TIER.legendary).toBe(4);
  });

  it("reads miles off the stamp, and zero off a card that has never been out", () => {
    expect(milesOf(copy(null))).toBe(0);
    expect(milesOf(copy(7))).toBe(7);
    expect(milesOf({ card: { trail: { miles: -3 } } })).toBe(0);
    expect(milesOf({ card: { trail: { miles: Number.NaN } } })).toBe(0);
  });

  it("titles are steep, in order, and a card holds the highest reached", () => {
    expect(TRAIL_TITLES.map((title) => title.miles)).toEqual([8, 16, 30]);
    expect(trailTitleFor(7)).toBeNull();
    expect(trailTitleFor(8)?.key).toBe("trailworn");
    expect(trailTitleFor(15)?.key).toBe("trailworn");
    expect(trailTitleFor(VETERAN_MILES)?.key).toBe("veteran");
    expect(trailTitleFor(WAYFARER_MILES)?.key).toBe("wayfarer");
    expect(trailTitleFor(99)?.key).toBe("wayfarer");
    expect(isVeteran(copy(16))).toBe(true);
    expect(isVeteran(copy(15))).toBe(false);
    expect(isWayfarer(copy(30))).toBe(true);
  });

  it("says how far the next title is", () => {
    expect(nextTrailTitle(0)).toEqual({ title: TRAIL_TITLES[0], left: 8 });
    expect(nextTrailTitle(12)).toEqual({ title: TRAIL_TITLES[1], left: 4 });
    expect(nextTrailTitle(30)).toBeNull();
    expect(trailLine(copy(12))).toBe("12 miles · Trailworn · 4 to Veteran");
    expect(trailLine(copy(1))).toBe("1 mile · 7 to Trailworn");
    expect(trailLine(copy(null))).toBeNull();
  });

  it("a Wayfarer is worth one more shine, and nothing short of one is", () => {
    // A plain gold is 3 shine; the title adds exactly WAYFARER_SHINE.
    expect(shineOf(copy(null))).toBe(3);
    expect(shineOf(copy(29))).toBe(3);
    expect(shineOf(copy(30))).toBe(3 + WAYFARER_SHINE);
    expect(WAYFARER_SHINE).toBe(1);
  });
});
