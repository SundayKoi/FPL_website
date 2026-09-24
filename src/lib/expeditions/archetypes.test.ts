import { describe, expect, it } from "vitest";
import { ARCHETYPE_TITLES, FALLBACK_ARCHETYPE } from "@/lib/cards/build";
import { WOUNDED_HOURS, type CardCopy } from "./config";
import { mulberry32 } from "./prng";
import { CACHE_LOOT } from "./routes";
import {
  ARCHETYPE_ABILITIES,
  ARCHETYPE_RULES,
  EDGE_BIG,
  LIFELINE_BENCH_HOURS,
  abilityOf,
  abilitySheet,
  activeAbilities,
  edgeLine,
  traitsOf,
  type AbilityKind,
} from "./archetypes";

// A fixture, not a real row: the edge reads the title and the trail stamp
// and nothing else, so a copy is an id, a title and some miles.
const copy = (id: number, archetype: string | undefined, miles = 0) =>
  ({ id, card: { archetype, trail: miles > 0 ? { miles, runs: 1, deepest: "scout" } : null } }) as unknown as CardCopy;

const KINDS: AbilityKind[] = [
  "loot", "finale", "guard", "shield", "front", "camp", "hold", "toll", "gamble", "find", "merchant",
  "rival", "ghost", "warned", "momentum", "call", "clock", "reveal", "mutation", "rescue", "jack",
];

describe("ARCHETYPE_ABILITIES", () => {
  it("gives every title the pool can mint an edge, and nothing else one", () => {
    // A title added to the pool without an edge would read as Jack of All
    // Trades on the road — silently the weakest edge there is — so a new
    // title fails here until the table names what it does.
    expect(Object.keys(ARCHETYPE_ABILITIES).sort()).toEqual([...ARCHETYPE_TITLES, FALLBACK_ARCHETYPE].sort());
    expect(new Set(ARCHETYPE_TITLES).size).toBe(ARCHETYPE_TITLES.length);
    expect(Object.keys(ARCHETYPE_ABILITIES)).toHaveLength(57);
  });

  it("files every edge under a known kind with a sentence to print", () => {
    for (const [title, ability] of Object.entries(ARCHETYPE_ABILITIES)) {
      expect(ability.title).toBe(title);
      expect(KINDS).toContain(ability.kind);
      expect(Number.isInteger(ability.power) && ability.power >= 0).toBe(true);
      // The sentences are built from the figures; a figure renamed out
      // from under a template prints "undefined" to every player.
      expect(ability.does).toMatch(/\.$/);
      expect(ability.does).not.toMatch(/undefined|NaN/);
    }
  });

  it("makes the fallback the only edge every real title outranks", () => {
    const zero = Object.values(ARCHETYPE_ABILITIES).filter((ability) => ability.power === 0).map((ability) => ability.title);
    expect(zero).toEqual([FALLBACK_ARCHETYPE]);
    expect(ARCHETYPE_ABILITIES[FALLBACK_ARCHETYPE].kind).toBe("jack");
  });

  it("sizes a cache an edge takes like a cache the road leaves", () => {
    // Camp Thief takes the rival's cache and Counter Jungler the ghost's;
    // both quote EDGE_BIG, which is only honest while it is CACHE_LOOT.
    expect(EDGE_BIG).toBe(CACHE_LOOT);
  });

  it("benches a Lifeline's wounds for less than a wound's", () => {
    expect(LIFELINE_BENCH_HOURS).toBeLessThan(WOUNDED_HOURS);
  });
});

describe("abilityOf", () => {
  it("reads the frozen title exactly, trimmed", () => {
    expect(abilityOf(copy(1, "Camp Thief")).title).toBe("Camp Thief");
    expect(abilityOf(copy(1, "  Unkillable ")).title).toBe("Unkillable");
  });

  it("reads a title the table does not know as Jack of All Trades", () => {
    // A title retired from the pool stays frozen on the cards that carry
    // it; a relic may carry none at all. Neither may crash a claim.
    expect(abilityOf(copy(1, "Baron Stealer")).title).toBe(FALLBACK_ARCHETYPE);
    expect(abilityOf(copy(1, "camp thief")).title).toBe(FALLBACK_ARCHETYPE);
    expect(abilityOf(copy(1, undefined)).title).toBe(FALLBACK_ARCHETYPE);
    expect(abilityOf({ card: null } as unknown as CardCopy).title).toBe(FALLBACK_ARCHETYPE);
    expect(abilityOf(copy(1, "constructor")).title).toBe(FALLBACK_ARCHETYPE);
  });
});

describe("abilitySheet", () => {
  it("counts every edge of a squad that fields three kinds", () => {
    const sheet = abilitySheet([copy(1, "The Surgeon"), copy(2, "Camp Thief"), copy(3, "Farm Demon")]);
    expect(sheet.map((entry) => [entry.copyId, entry.ability.kind, entry.counts])).toEqual([
      [1, "guard", true],
      [2, "rival", true],
      [3, "camp", true],
    ]);
  });

  it("counts the higher power of two edges of a kind, however far the other has walked", () => {
    const sheet = abilitySheet([copy(1, "Gank Squad", 40), copy(2, "Camp Thief", 0), copy(3, "Farm Demon")]);
    expect(sheet[0]).toMatchObject({ copyId: 1, counts: false, ignoredFor: 2 });
    expect(sheet[1]).toMatchObject({ copyId: 2, counts: true });
  });

  it("breaks a tie on power by trail miles, then by the lower id, in any squad order", () => {
    // The further-walked card has the HIGHER id, so only miles can pick it.
    const byMiles = [copy(4, "Camp Thief", 3), copy(7, "Camp Thief", 12), copy(9, "Farm Demon")];
    for (const squad of [byMiles, [...byMiles].reverse()]) {
      expect(activeAbilities(squad).filter((entry) => entry.ability.kind === "rival").map((entry) => entry.copyId)).toEqual([7]);
    }
    const byId = [copy(7, "The Surgeon", 5), copy(4, "Weakside Warrior", 5), copy(9, "Farm Demon")];
    for (const squad of [byId, [...byId].reverse()]) {
      const guard = abilitySheet(squad).filter((entry) => entry.ability.kind === "guard");
      expect(guard.find((entry) => entry.counts)?.copyId).toBe(4);
      expect(guard.find((entry) => !entry.counts)).toMatchObject({ copyId: 7, ignoredFor: 4 });
    }
  });

  it("never counts more than one edge of a kind, whatever the squad", () => {
    const titles = Object.keys(ARCHETYPE_ABILITIES);
    const rand = mulberry32(20260923);
    for (let trial = 0; trial < 500; trial += 1) {
      const squad = [1, 2, 3].map((id) => copy(id, titles[Math.floor(rand() * titles.length)], Math.floor(rand() * 3) * 8));
      const sheet = abilitySheet(squad);
      expect(sheet).toHaveLength(3);
      for (const kind of new Set(sheet.map((entry) => entry.ability.kind))) {
        const ofKind = sheet.filter((entry) => entry.ability.kind === kind);
        const winners = ofKind.filter((entry) => entry.counts);
        expect(winners).toHaveLength(1);
        for (const loser of ofKind.filter((entry) => !entry.counts)) expect(loser.ignoredFor).toBe(winners[0].copyId);
      }
      expect(activeAbilities(squad)).toEqual(sheet.filter((entry) => entry.counts));
    }
  });
});

describe("traitsOf", () => {
  const squad = (...titles: string[]) => titles.map((title, index) => copy(index + 1, title));

  it("is off for every run stamped below the edge rulebook", () => {
    const loaded = squad("Speedrunner", "Roam Enjoyer", "Jungle Diff");
    expect(traitsOf(loaded, ARCHETYPE_RULES - 1)).toEqual({ stormproof: false, hunterFinds: false, merchantDraw: false, reveal: "none", speedrun: false });
    expect(traitsOf(loaded, ARCHETYPE_RULES)).toEqual({ stormproof: true, hunterFinds: true, merchantDraw: false, reveal: "two", speedrun: true });
  });

  it("reads each trait off the edge that gives it", () => {
    expect(traitsOf(squad("Tempo Setter", "Farm Demon", "The Warden"), ARCHETYPE_RULES)).toEqual({
      stormproof: true, hunterFinds: false, merchantDraw: false, reveal: "danger", speedrun: false,
    });
    expect(traitsOf(squad("First Blood Merchant", "Farm Demon", "Duelist"), ARCHETYPE_RULES).merchantDraw).toBe(true);
    expect(traitsOf(squad("Farm Demon", "Duelist", "Camp Thief"), ARCHETYPE_RULES)).toEqual({
      stormproof: false, hunterFinds: false, merchantDraw: false, reveal: "none", speedrun: false,
    });
  });

  it("gives nothing for an edge its kind does not count", () => {
    // Gold Hoarder outranks First Blood Merchant, so the extra merchant
    // never comes; Roam Enjoyer outranks Turret Melter, so a companion of
    // the same kind costs the leader nothing.
    expect(traitsOf(squad("Gold Hoarder", "First Blood Merchant", "Farm Demon"), ARCHETYPE_RULES).merchantDraw).toBe(false);
    expect(traitsOf(squad("Turret Melter", "Roam Enjoyer", "Farm Demon"), ARCHETYPE_RULES).hunterFinds).toBe(true);
    // Two clocks: the Speedrunner counts, and it is stormproof as well.
    expect(traitsOf(squad("Tempo Setter", "Speedrunner", "Farm Demon"), ARCHETYPE_RULES)).toMatchObject({ stormproof: true, speedrun: true });
  });
});

describe("edgeLine", () => {
  it("names the squad's edges", () => {
    expect(edgeLine([copy(1, "Camp Thief"), copy(2, "Unkillable"), copy(3, "Gold Hoarder")])).toBe(
      "The squad's edge: Camp Thief, Unkillable and Gold Hoarder.",
    );
  });

  it("names a duplicate as what it is", () => {
    expect(edgeLine([copy(1, "Camp Thief", 10), copy(2, "Unkillable"), copy(3, "Camp Thief")])).toBe(
      "The squad's edge: Camp Thief and Unkillable, and a second Camp Thief, which counts for nothing.",
    );
    expect(edgeLine([copy(1, FALLBACK_ARCHETYPE), copy(2, FALLBACK_ARCHETYPE), copy(3, FALLBACK_ARCHETYPE)])).toBe(
      "The squad's edge: Jack of All Trades, and a second Jack of All Trades and a third Jack of All Trades, which count for nothing.",
    );
  });

  it("says which edge an outranked one stands behind", () => {
    expect(edgeLine([copy(1, "The Surgeon", 20), copy(2, "Weakside Warrior"), copy(3, "Camp Thief")])).toBe(
      "The squad's edge: The Surgeon and Camp Thief, and Weakside Warrior, which counts for nothing beside The Surgeon.",
    );
  });

  it("has nothing to say about nobody", () => {
    expect(edgeLine([])).toBeNull();
  });
});
