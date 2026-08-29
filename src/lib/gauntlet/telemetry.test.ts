import { describe, expect, it } from "vitest";
import { relicOfferRow, roundLogRow } from "./telemetry";
import type { GauntletRunRow } from "./run";
import type { MatchResult } from "./sim";

const run = {
  id: 7,
  discord_id: "abc",
  season: "S4",
  week_start: "2026-08-24",
  lineup: [],
  lineup_avg: 78.5,
  round: 3,
  score: 400,
  relics: ["ember_heart", "frost_ward"],
  relic_offer: ["gold_seal", "void_pact", "ember_heart"],
  bench_swap_used: false,
  status: "active",
  round_seed: null,
  next_opponent: { cards: [], style: "dive", avg: 76, label: "DIVE · 76", condition: "bloodmoon", boss: "the_wall" },
  last_result: null,
  crossroads: { state: { situationKey: "the_baron_question" }, seed2: 12 },
} as unknown as GauntletRunRow;

const result = { won: true, score: 212.6, daring: 44.4, momentum: 63.7 } as MatchResult;

describe("the round log row", () => {
  it("records the call, the outcome, and the shape of the fight", () => {
    const row = roundLogRow(run, "call_the_baron", result);
    expect(row).toEqual({
      run_id: 7,
      season: "S4",
      week_start: "2026-08-24",
      round: 3,
      lineup_avg: 78.5,
      situation_key: "the_baron_question",
      choice_key: "call_the_baron",
      won: true,
      score: 213,
      daring: 44,
      momentum: 64,
      relics: ["ember_heart", "frost_ward"],
      opponent_avg: 76,
      condition_key: "bloodmoon",
      boss_key: "the_wall",
    });
  });

  it("records the relics the round was FOUGHT with, not the ones taken after", () => {
    // The pick that follows a win belongs to the next round's row. Getting
    // this backwards would credit every relic with the fight that won it.
    expect(roundLogRow(run, "hold", result).relics).toEqual(run.relics);
  });

  it("rounds the engine's floats — the columns are ints", () => {
    const row = roundLogRow(run, "hold", { ...result, score: 0.6, daring: -0.4, momentum: 49.5 });
    expect(Number.isInteger(row.score)).toBe(true);
    expect(Number.isInteger(row.daring)).toBe(true);
    expect(Number.isInteger(row.momentum)).toBe(true);
  });

  it("survives a run with no opponent or no crossroads on it", () => {
    const bare = { ...run, next_opponent: null, crossroads: null } as GauntletRunRow;
    const row = roundLogRow(bare, "hold", result);
    expect(row.opponent_avg).toBeNull();
    expect(row.condition_key).toBeNull();
    expect(row.boss_key).toBeNull();
    expect(row.situation_key).toBe("");
  });
});

describe("the relic offer row", () => {
  it("keeps the denominator: what was on the table and what was already held", () => {
    expect(relicOfferRow(run, "gold_seal")).toEqual({
      run_id: 7,
      season: "S4",
      week_start: "2026-08-24",
      round: 3,
      offered: ["gold_seal", "void_pact", "ember_heart"],
      taken: "gold_seal",
      held: ["ember_heart", "frost_ward"],
    });
  });

  it("records an empty offer rather than inventing one", () => {
    const bare = { ...run, relic_offer: null } as GauntletRunRow;
    expect(relicOfferRow(bare, "gold_seal").offered).toEqual([]);
  });
});
