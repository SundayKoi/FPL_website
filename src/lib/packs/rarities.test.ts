import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import { SECRET_CHANCE, SHINY_CHANCE, STATTRAK_CHANCE } from "./config";
import { finishEligible, rollPackFinishes, secretSerialLabel, stampFinishes, stattrakLabel } from "./rarities";

const card = { collectionSize: 120 } as PlayerCardData;
const plain = { card, foilType: null };

/** A rand that hands back a scripted list, then 1 (never hits) forever. */
function scripted(values: number[]): () => number {
  const queue = [...values];
  return () => (queue.length > 0 ? queue.shift()! : 1);
}

describe("finishEligible", () => {
  it("takes any player card, foil or signed or not", () => {
    expect(finishEligible(plain)).toBe(true);
    expect(finishEligible({ card, foilType: "ice" })).toBe(true);
  });

  it("refuses moments, plates, relics and the Eclipse", () => {
    expect(finishEligible({ card: { ...card, moment: {} as never }, foilType: null })).toBe(false);
    expect(finishEligible({ card: { ...card, team: {} as never }, foilType: null })).toBe(false);
    expect(finishEligible({ card: { ...card, champWin: {} as never }, foilType: null })).toBe(false);
    expect(finishEligible({ card, foilType: "eclipse" })).toBe(false);
  });
});

describe("rollPackFinishes", () => {
  it("draws three gates per eligible print, in shiny → stattrak → secret order", () => {
    const rolls = rollPackFinishes([plain], scripted([SHINY_CHANCE - 1e-9, STATTRAK_CHANCE - 1e-9, SECRET_CHANCE - 1e-9]));
    expect(rolls).toEqual([{ shiny: true, stattrak: true, secret: true }]);
  });

  it("misses when the draw lands on the gate", () => {
    const rolls = rollPackFinishes([plain], scripted([SHINY_CHANCE, STATTRAK_CHANCE, SECRET_CHANCE]));
    expect(rolls).toEqual([{ shiny: false, stattrak: false, secret: false }]);
  });

  it("draws nothing at all for an ineligible print, so later prints' draws do not move", () => {
    const eclipse = { card, foilType: "eclipse" };
    const rolls = rollPackFinishes([eclipse, plain], scripted([0, 1, 1]));
    expect(rolls[0]).toEqual({ shiny: false, stattrak: false, secret: false });
    expect(rolls[1].shiny).toBe(true);
  });

  it("keeps one Secret per pack — the first", () => {
    const rolls = rollPackFinishes([plain, plain, plain], scripted([1, 1, 0, 1, 1, 0, 1, 1, 0]));
    expect(rolls.map((roll) => roll.secret)).toEqual([true, false, false]);
  });
});

describe("stampFinishes", () => {
  const now = new Date("2026-09-07T04:00:00.000Z");

  it("returns the card untouched when nothing hit", () => {
    expect(stampFinishes(card, { shiny: false, stattrak: false, secret: false }, { secretsFound: 0, now })).toBe(card);
  });

  it("numbers a Secret past the checklist, counting from the ones already found", () => {
    const first = stampFinishes(card, { shiny: false, stattrak: false, secret: true }, { secretsFound: 0, now });
    expect(first.secret).toEqual({ number: 121, of: 120 });
    const third = stampFinishes(card, { shiny: false, stattrak: false, secret: true }, { secretsFound: 2, now });
    expect(third.secret).toEqual({ number: 123, of: 120 });
    expect(secretSerialLabel(third.secret!)).toBe("#123/120");
  });

  it("starts a StatTrak at zero, dated now", () => {
    const stamped = stampFinishes(card, { shiny: false, stattrak: true, secret: false }, { secretsFound: 0, now });
    expect(stamped.stattrak).toEqual({ points: 0, since: "2026-09-07T04:00:00.000Z" });
    expect(stamped.shiny).toBeUndefined();
  });

  it("flags a Shiny", () => {
    expect(stampFinishes(card, { shiny: true, stattrak: false, secret: false }, { secretsFound: 0, now }).shiny).toBe(true);
  });
});

describe("stattrakLabel", () => {
  it("prints a whole, grouped count and never a negative", () => {
    expect(stattrakLabel(1284.4)).toBe("1,284");
    expect(stattrakLabel(-3)).toBe("0");
  });
});

describe("the finishes' CSS", () => {
  it("defines every layer PlayerCard3D names for a finish", async () => {
    const { readFileSync } = await import("node:fs");
    const { join } = await import("node:path");
    const css = readFileSync(join(process.cwd(), "src/app/globals.css"), "utf8");
    for (const layer of ["card-shiny-art", "card-shiny-burst", "card-secret-frame", "card-stattrak-led"]) {
      expect(css, layer).toContain(`@utility ${layer}`);
    }
  });
});
