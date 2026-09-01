// The Eclipse gate, as a set of claims about the numbers rather than about
// the code — these are the decisions, and a change to any of them should
// have to argue with a test first.
import { describe, expect, it } from "vitest";
import { applyEclipse, isEclipseEligible, type EclipsePrint } from "./eclipse";
import {
  ALL_FOIL_TYPES,
  CHASE_FOIL_TYPES,
  ECLIPSE_CHANCE,
  ECLIPSE_FOIL_TYPE,
  FOIL_TYPES,
  FOIL_TYPE_WEIGHTS,
  rollFoilType,
} from "./config";

describe("Eclipse is outside the foil ladder", () => {
  it("has no weight, so no ordinary foil roll can produce one", () => {
    // The guarantee is structural. There is no weight to draw, so this
    // cannot be undone by a tuning pass on the weights table.
    expect(Object.keys(FOIL_TYPE_WEIGHTS)).not.toContain(ECLIPSE_FOIL_TYPE);
    expect(FOIL_TYPES as readonly string[]).not.toContain(ECLIPSE_FOIL_TYPE);
  });

  it("is never returned by rollFoilType, at any point in the stream", () => {
    for (let i = 0; i < 2000; i++) {
      expect(rollFoilType(() => i / 2000)).not.toBe(ECLIPSE_FOIL_TYPE);
    }
  });

  it("still renders like any other parallel", () => {
    expect(ALL_FOIL_TYPES).toContain(ECLIPSE_FOIL_TYPE);
    expect(CHASE_FOIL_TYPES).toContain(ECLIPSE_FOIL_TYPE);
  });
});

describe("the drop rate is the one that was agreed", () => {
  it("is half a percent of Card-of-the-Week pulls", () => {
    expect(ECLIPSE_CHANCE).toBe(0.005);
  });

  it("works out at roughly one Eclipse per thousand-odd packs", () => {
    // The gate in front of the rate is what makes the number small. A Card
    // of the Week is the top card in each role, and the roller picks
    // uniformly inside a rarity class, so it lands in a few percent of
    // slots. Both ends of the plausible range are checked, because a league
    // getting more top-heavy moves this on its own.
    const perPack = (gate: number) => 1 - (1 - gate * ECLIPSE_CHANCE) ** 5;
    const thin = 1 / perPack(0.044);
    const typical = 1 / perPack(0.021);
    expect(Math.round(thin)).toBeGreaterThan(500);
    expect(Math.round(typical)).toBeLessThan(4000);
    // And the headline claim: rare, but not once-a-decade rare.
    expect(Math.round(thin)).toBeLessThan(2000);
    expect(Math.round(typical)).toBeGreaterThan(800);
  });

  it("is rare enough that a season of packs usually yields at most one", () => {
    // 150 packs a week for ten weeks, at the more generous gate.
    const perPack = 1 - (1 - 0.044 * ECLIPSE_CHANCE) ** 5;
    expect(1500 * perPack).toBeLessThan(3);
    // ...but not so rare that it probably never happens at all.
    expect(1500 * perPack).toBeGreaterThan(0.5);
  });
});


const card = (extra: Record<string, unknown> = {}) =>
  ({ slug: "doug-na1", name: "Doug", standout: true, ...extra }) as never;
const print = (extra: Partial<EclipsePrint> = {}): EclipsePrint => ({
  card: card(),
  foil: false,
  foilType: null,
  signed: false,
  autograph: null,
  ...extra,
});

describe("only a Card of the Week can become one", () => {
  it("accepts a crowned card", () => {
    expect(isEclipseEligible(card())).toBe(true);
  });

  it("refuses an uncrowned card however good it is", () => {
    expect(isEclipseEligible(card({ standout: false, overall: 99 }))).toBe(false);
  });

  it("refuses moments and team cards even when flagged", () => {
    // They are their own kind of object, with their own art. An Eclipse
    // frame over a moment plate reads as a rendering bug, not a chase.
    expect(isEclipseEligible(card({ moment: { id: 1 } }))).toBe(false);
    expect(isEclipseEligible(card({ team: { name: "Alcatraz" } }))).toBe(false);
  });
});

describe("an Eclipse takes the player's ink automatically", () => {
  // Left to the ordinary 1% roll, the two gates compound to ~1 in 91,000
  // packs — one signed Eclipse every twelve years at this league's volume.
  // Meanwhile a COMMON copy of the same player can roll signed, so chance
  // would make the rarest card in the game the plain version of a player
  // whose commons are autographed.
  it("signs it when the player has drawn one", () => {
    const out = applyEclipse(print(), "data:image/png;base64,INK");
    expect(out.signed).toBe(true);
    expect(out.autograph).toBe("data:image/png;base64,INK");
    // Frozen into the copy, so a later redraw never rewrites it.
    expect(out.card.autograph).toBe("data:image/png;base64,INK");
  });

  it("still mints for a player who never drew one — just the lesser of the two", () => {
    const out = applyEclipse(print(), null);
    expect(out.foilType).toBe(ECLIPSE_FOIL_TYPE);
    expect(out.signed).toBe(false);
    expect(out.autograph).toBeNull();
  });

  it("never overwrites ink the copy already rolled", () => {
    const out = applyEclipse(print({ signed: true, autograph: "ROLLED" }), "CURRENT");
    expect(out.autograph).toBe("ROLLED");
    expect(out.signed).toBe(true);
  });

  it("always comes out foil, whatever the copy rolled", () => {
    for (const before of [print(), print({ foil: true, foilType: "ice" })]) {
      const out = applyEclipse(before, null);
      expect(out.foil).toBe(true);
      expect(out.foilType).toBe(ECLIPSE_FOIL_TYPE);
    }
  });

  it("leaves the artwork alone", () => {
    // A signed pull rolls alternate art on its own rarer gate, but that roll
    // has already happened by the time an Eclipse is decided. Re-rolling
    // here would consume rand outside the pinned sequence.
    const before = print({ card: card({ artSkin: 7 }) });
    expect(applyEclipse(before, "INK").card.artSkin).toBe(7);
  });
});
