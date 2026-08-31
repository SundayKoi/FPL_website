import { describe, expect, it } from "vitest";
import {
  heirloomBlurb,
  heirloomEffects,
  heirloomOf,
  MOMENT_EFFECTS,
  PLATE_CHEMISTRY_CAP,
  PLATE_CHEMISTRY_PER_MATCH,
  plateMatches,
  type StoredHeirloom,
} from "./heirlooms";
import { generateOpponent } from "./opponents";
import { aggregateEffects, mergeRelicEffects, offerRelics, type RelicDef } from "./relics";
import { aggregateTraits, conditionEffects } from "./traits";
import { GAUNTLET_ROLES, type GauntletCard, type MatchContext, mulberry32, simulateMatch } from "./sim";
import type { PlayerCardData } from "@/lib/cards/build";

function team(avg: number, teamName: string | null = null): GauntletCard[] {
  return GAUNTLET_ROLES.map((role, index) => ({
    inventoryId: index,
    name: `P${index}`,
    role,
    overall: avg,
    stats: {
      combat: avg, damage: avg, economy: avg, laning: avg, vision: avg,
      objectives: avg, turrets: avg, survival: avg, presence: avg, impact: avg,
    },
    foil: false,
    signed: false,
    fresh: false,
    team: teamName,
  }));
}

const moment = (triggerKey: string | null) =>
  ({ moment: { id: 1, title: "THE STEAL", triggerKey } } as unknown as PlayerCardData);
const plate = (teamName: string) =>
  ({ team: { teamName, monogram: "FL", abbr: "FLS" } } as unknown as PlayerCardData);

describe("reading a copy as an heirloom", () => {
  it("takes a moment's colorway family from its trigger", () => {
    expect(heirloomOf(7, moment("baron_steal"))).toEqual({
      inventoryId: 7,
      kind: "moment",
      title: "THE STEAL",
      family: "void",
    });
    expect(heirloomOf(7, moment("pentakill"))!.family).toBe("ember");
  });

  it("takes a plate's roster", () => {
    expect(heirloomOf(9, plate("The Faceless"))).toEqual({
      inventoryId: 9,
      kind: "plate",
      title: "FLS roster",
      teamName: "The Faceless",
    });
  });

  it("refuses an ordinary card", () => {
    // Only the shelf relics come along. A player card belongs in the five.
    expect(heirloomOf(1, { name: "Doug" } as PlayerCardData)).toBeNull();
  });

  it("gives a pre-redesign moment the fallback family rather than nothing", () => {
    // Copies frozen before Signature Moments carry no triggerKey.
    expect(heirloomOf(1, moment(null))!.family).toBeDefined();
  });
});

describe("what an heirloom does", () => {
  it("is nothing at all without one", () => {
    expect(heirloomEffects(null, team(74))).toEqual({});
    expect(heirloomEffects(undefined, team(74))).toEqual({});
  });

  it("hands a moment its family's dial", () => {
    const ember: StoredHeirloom = { inventoryId: 1, kind: "moment", title: "x", family: "ember" };
    expect(heirloomEffects(ember, team(74))).toEqual(MOMENT_EFFECTS.ember);
  });

  it("pays a plate only for the roster you actually fielded", () => {
    // The whole point of a plate: it is a reason to field THAT five.
    const faceless: StoredHeirloom = { inventoryId: 2, kind: "plate", title: "FLS", teamName: "The Faceless" };
    expect(heirloomEffects(faceless, team(74, "Some Other Team"))).toEqual({});
    expect(heirloomEffects(faceless, team(74, "The Faceless")).chemistryMult).toBeGreaterThan(1);
  });

  it("scales with how many of them you brought, and stops", () => {
    const faceless: StoredHeirloom = { inventoryId: 2, kind: "plate", title: "FLS", teamName: "The Faceless" };
    const mixed = team(74, "The Faceless").map((card, index) =>
      index < 2 ? card : { ...card, team: "Elsewhere" },
    );
    const two = heirloomEffects(faceless, mixed).chemistryMult!;
    const five = heirloomEffects(faceless, team(74, "The Faceless")).chemistryMult!;
    expect(two).toBeCloseTo(1 + PLATE_CHEMISTRY_PER_MATCH * 2, 6);
    expect(five).toBeGreaterThan(two);
    expect(five).toBeLessThanOrEqual(PLATE_CHEMISTRY_CAP);
  });

  it("matches a team name regardless of casing or stray spaces", () => {
    const faceless: StoredHeirloom = { inventoryId: 2, kind: "plate", title: "FLS", teamName: " the faceless " };
    expect(plateMatches(faceless, team(74, "The Faceless"))).toBe(5);
  });

  it("says what it is doing, including when it is doing nothing", () => {
    const faceless: StoredHeirloom = { inventoryId: 2, kind: "plate", title: "FLS", teamName: "The Faceless" };
    expect(heirloomBlurb(faceless, 0)).toContain("does nothing");
    expect(heirloomBlurb(faceless, 3)).toContain("3 of your five");
    expect(heirloomBlurb(null, 0)).toBeNull();
  });
});

describe("calibration — an heirloom is an edge, not an answer", () => {
  /** Rounds won across a campaign. A far bigger sample than full clears,
   *  which at this bracket is a couple of dozen out of three thousand and
   *  swamped by Poisson noise. */
  function roundsWon(runs: number, heirloom: StoredHeirloom | null, lineup: GauntletCard[]): number {
    let won = 0;
    for (let run = 0; run < runs; run += 1) {
      let alive = true;
      const held: string[] = [];
      for (let round = 1; round <= 8 && alive; round += 1) {
        const opponent = generateOpponent(74, round, mulberry32(run * 97 + round));
        const ctx: MatchContext = {
          effects: mergeRelicEffects(aggregateEffects(held), heirloomEffects(heirloom, lineup)),
          foe: aggregateTraits(opponent.traits ?? []),
          arena: conditionEffects(opponent.condition),
          plan: opponent.plan,
        };
        alive = simulateMatch(lineup, opponent.cards, ctx, mulberry32(run * 31 + round * 7)).won;
        if (alive) {
          won += 1;
          const offer: RelicDef[] = offerRelics(held, mulberry32(run * 53 + round * 11), round);
          if (offer.length > 0) held.push(offer[0].key);
        }
      }
    }
    return won;
  }

  it("gives every family about the same edge, so none is the answer", () => {
    // Measured at 3,000 runs (~9,000 rounds per arm). The families are
    // NOT equal in raw numbers because the beats are not equal — a point
    // on the hold is worth about a quarter of a point on a fight — so the
    // numbers in MOMENT_EFFECTS are the ones that made the OUTCOMES
    // equal:
    //
    //   none   9062 rounds
    //   ember  9661   +6.6%
    //   void   9688   +6.9%
    //   ice    9683   +6.9%
    //   gold   9686   +6.9%
    //
    // Shrunk here to keep the suite quick. Re-measure at 3,000 before
    // touching any number in MOMENT_EFFECTS.
    const RUNS = 500;
    const flat = team(74);
    const base = roundsWon(RUNS, null, flat);
    const lifts = (Object.keys(MOMENT_EFFECTS) as (keyof typeof MOMENT_EFFECTS)[]).map((family) => {
      const held: StoredHeirloom = { inventoryId: 1, kind: "moment", title: family, family };
      return (roundsWon(RUNS, held, flat) - base) / base;
    });
    for (const lift of lifts) {
      // A real edge...
      expect(lift).toBeGreaterThan(0.01);
      // ...that never decides the run on its own.
      expect(lift).toBeLessThan(0.16);
    }
    // And no family runs away from the others.
    expect(Math.max(...lifts) - Math.min(...lifts)).toBeLessThan(0.07);
  }, 120000);

  it("costs nothing when the plate's roster isn't fielded", () => {
    // Not "almost nothing" — the effects object is empty, so the run is
    // byte-identical to one with no heirloom at all.
    const RUNS = 300;
    const flat = team(74);
    const wrongPlate: StoredHeirloom = { inventoryId: 2, kind: "plate", title: "FLS", teamName: "Nobody" };
    expect(roundsWon(RUNS, wrongPlate, flat)).toBe(roundsWon(RUNS, null, flat));
  }, 120000);

  it("pays a plate about what a moment pays, on the five it belongs to", () => {
    const RUNS = 500;
    const roster = team(74, "The Faceless");
    const plateHeirloom: StoredHeirloom = { inventoryId: 2, kind: "plate", title: "FLS", teamName: "The Faceless" };
    const base = roundsWon(RUNS, null, roster);
    const lift = (roundsWon(RUNS, plateHeirloom, roster) - base) / base;
    expect(lift).toBeGreaterThan(0.01);
    expect(lift).toBeLessThan(0.16);
  }, 120000);
});
