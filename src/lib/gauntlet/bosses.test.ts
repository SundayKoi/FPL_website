import { describe, expect, it } from "vitest";
import {
  BOSS_BY_KEY,
  bossEffects,
  bossFor,
  FINAL_BOSSES,
  FINAL_ROUND,
  GATE_BOSSES,
  GATE_ROUND,
  isBossRound,
  bossRoundOf,
} from "./bosses";
import { mulberry32 } from "./sim";

describe("the boss catalog", () => {
  it("gives every wall a RULE and a counter, not a bigger number", () => {
    for (const boss of [...GATE_BOSSES, ...FINAL_BOSSES]) {
      expect(boss.title, boss.key).toMatch(/^THE /);
      expect(boss.rule.length, boss.key).toBeGreaterThan(20);
      expect(boss.counter.length, boss.key).toBeGreaterThan(20);
      expect(boss.flavor.length, boss.key).toBeGreaterThan(10);
      // A boss whose effects object is empty is a stat check wearing a
      // costume — the one thing this catalog is not allowed to be.
      expect(Object.keys(boss.effects).length, boss.key).toBeGreaterThan(0);
    }
    const keys = [...GATE_BOSSES, ...FINAL_BOSSES].map((boss) => boss.key);
    expect(new Set(keys).size).toBe(keys.length);
  });

  it("stands a wall only on rounds 4 and 8", () => {
    expect(isBossRound(GATE_ROUND)).toBe(true);
    expect(isBossRound(FINAL_ROUND)).toBe(true);
    for (const round of [1, 2, 3, 5, 6, 7]) {
      expect(isBossRound(round), `round ${round}`).toBe(false);
      expect(bossFor(round, mulberry32(round))).toBeNull();
    }
    // And each round draws from its own pool.
    for (let seed = 0; seed < 40; seed += 1) {
      expect(GATE_BOSSES).toContain(bossFor(GATE_ROUND, mulberry32(seed)));
      expect(FINAL_BOSSES).toContain(bossFor(FINAL_ROUND, mulberry32(seed)));
    }
  });

  it("is deterministic per seed, and resolves effects safely", () => {
    expect(bossFor(GATE_ROUND, mulberry32(9))).toBe(bossFor(GATE_ROUND, mulberry32(9)));
    expect(bossEffects(null)).toEqual({});
    expect(bossEffects(undefined)).toEqual({});
    expect(bossEffects("not-a-boss")).toEqual({});
    expect(bossEffects("gatekeeper").tieBand).toBe(2);
    expect(BOSS_BY_KEY.get("closer")?.effects.lossSwingMult).toBe(2);
    // Which round a wall stands at is read from the pools, never guessed.
    for (const boss of GATE_BOSSES) expect(bossRoundOf(boss.key)).toBe(GATE_ROUND);
    for (const boss of FINAL_BOSSES) expect(bossRoundOf(boss.key)).toBe(FINAL_ROUND);
    expect(bossRoundOf(null)).toBeNull();
    expect(bossRoundOf("not-a-boss")).toBeNull();
  });
});
