import { describe, expect, it } from "vitest";
import { CROSSROADS_CATALOG, situationFor, daringAt, winChanceOf } from "./crossroads";
import { MEASURE_LABELS, type MeasureKey } from "@/lib/cards/measures";

const BANDS = [
  { name: "behind", momentum: 20 },
  { name: "even", momentum: 50 },
  { name: "ahead", momentum: 80 },
];

describe("the crossroads catalog", () => {
  it("offers more than one situation in every band", () => {
    // The reason this file exists. situationFor used to pick PURELY by
    // band, and there was one situation per band — so a run that kept
    // winning saw the same call in all eight rounds, every run, forever.
    for (const band of BANDS) {
      const candidates = CROSSROADS_CATALOG.filter(
        (situation) => band.momentum >= situation.band[0] && band.momentum <= situation.band[1],
      );
      expect(candidates.length, `${band.name} has ${candidates.length}`).toBeGreaterThan(1);
    }
  });

  it("covers every momentum from 0 to 100, with no gap", () => {
    for (let momentum = 0; momentum <= 100; momentum += 1) {
      expect(situationFor(momentum, 0), `momentum ${momentum}`).toBeTruthy();
    }
  });

  it("picks a different call for a different seed, inside the same band", () => {
    for (const band of BANDS) {
      const seen = new Set(
        Array.from({ length: 24 }, (_, seed) => situationFor(band.momentum, seed).key),
      );
      expect(seen.size, `${band.name} only ever showed ${[...seen]}`).toBeGreaterThan(1);
    }
  });

  it("never leaves the band it was asked for", () => {
    for (const band of BANDS) {
      for (let seed = 0; seed < 40; seed += 1) {
        const situation = situationFor(band.momentum, seed);
        expect(band.momentum).toBeGreaterThanOrEqual(situation.band[0]);
        expect(band.momentum).toBeLessThanOrEqual(situation.band[1]);
      }
    }
  });

  it("is stable for one seed, and unbothered by a negative or vast one", () => {
    // The seed is a week+round hash: everyone in a week must get the same
    // call on the same round, and a hash is allowed to be huge or signed.
    expect(situationFor(80, 7).key).toBe(situationFor(80, 7).key);
    expect(() => situationFor(80, -12345)).not.toThrow();
    expect(() => situationFor(80, 2 ** 40)).not.toThrow();
    expect(situationFor(80, -1).key).toBe(situationFor(80, 1).key);
  });

  it("answers the first in the band when nobody passes a seed", () => {
    // Backwards compatible on purpose: a caller from before this existed
    // gets exactly what it always got.
    for (const band of BANDS) {
      const first = CROSSROADS_CATALOG.find(
        (situation) => band.momentum >= situation.band[0] && band.momentum <= situation.band[1],
      );
      expect(situationFor(band.momentum).key).toBe(first?.key);
    }
  });
});

describe("every situation is playable", () => {
  const keys = new Set(CROSSROADS_CATALOG.map((situation) => situation.key));

  it("has a unique key, three choices, and unique choice keys", () => {
    expect(keys.size).toBe(CROSSROADS_CATALOG.length);
    for (const situation of CROSSROADS_CATALOG) {
      expect(situation.choices, situation.key).toHaveLength(3);
      expect(new Set(situation.choices.map((choice) => choice.key)).size).toBe(3);
      expect(situation.narration.length).toBeGreaterThan(10);
    }
  });

  it("leaves a way to not gamble in every band", () => {
    // Not in every SITUATION: the original three include two — the baron
    // question and the pit — where all three calls are actions, and a
    // scoreboard that forces a decision is a fair thing for a situation to
    // do. What must not happen is a whole band offering nothing but dice,
    // because then a player who wants to hold has no way to.
    for (const band of BANDS) {
      const candidates = CROSSROADS_CATALOG.filter(
        (situation) => band.momentum >= situation.band[0] && band.momentum <= situation.band[1],
      );
      const withSafe = candidates.filter((situation) =>
        situation.choices.some((choice) => choice.yourKeys.length === 0 && choice.theirKeys.length === 0),
      );
      expect(withSafe.length, `${band.name} offers no way to hold`).toBeGreaterThan(0);
    }
  });

  it("gives a no-roll call no swing and no daring", () => {
    for (const situation of CROSSROADS_CATALOG) {
      for (const choice of situation.choices) {
        if (choice.yourKeys.length > 0 || choice.theirKeys.length > 0) continue;
        expect(choice.win, `${situation.key}/${choice.key}`).toBe(choice.lose);
        expect(choice.scoreBonus).toBe(0);
      }
    }
  });

  it("names only measures a card actually carries", () => {
    // A typo'd key would silently score as a missing bar rather than fail.
    for (const situation of CROSSROADS_CATALOG) {
      for (const choice of situation.choices) {
        for (const key of [...choice.yourKeys, ...choice.theirKeys]) {
          expect(MEASURE_LABELS[key as MeasureKey], `${situation.key}/${choice.key}: ${key}`).toBeTruthy();
        }
      }
    }
  });

  it("makes every gamble cost something when it misses", () => {
    // The rule that stops "always gamble" being free — a call that risks
    // nothing is not a call.
    for (const situation of CROSSROADS_CATALOG) {
      for (const choice of situation.choices) {
        if (choice.yourKeys.length === 0) continue;
        expect(choice.lose, `${situation.key}/${choice.key}`).toBeLessThan(0);
        expect(choice.scoreBonus).toBeGreaterThan(0);
        expect(choice.consequence.note.length).toBeGreaterThan(10);
      }
    }
  });

  it("prices daring by the risk actually taken", () => {
    // Unchanged by the new content, and worth pinning while it is nearby:
    // being better at a call makes landing it worth less.
    const longShot = daringAt(100, winChanceOf(40, 60));
    const nearCertain = daringAt(100, winChanceOf(60, 40));
    expect(longShot).toBeGreaterThan(nearCertain);
  });
});
