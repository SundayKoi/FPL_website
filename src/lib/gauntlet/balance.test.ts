import { describe, expect, it } from "vitest";
import {
  buildBalanceReport,
  DOMINANT_AT,
  IGNORED_AT,
  LIFT_BAND,
  MIN_SAMPLE,
  type OfferSample,
  type RoundSample,
} from "./balance";
import { CROSSROADS_CATALOG } from "./crossroads";
import { RELIC_CATALOG } from "./relics";

const SITUATION = CROSSROADS_CATALOG[0];
const [FIRST_CALL, SECOND_CALL] = SITUATION.choices;
const RELIC_A = RELIC_CATALOG[0].key;
const RELIC_B = RELIC_CATALOG[1].key;
const RELIC_C = RELIC_CATALOG[2].key;

function round(over: Partial<RoundSample> = {}, index = 0): RoundSample {
  return {
    run_id: index,
    round: 1,
    situation_key: SITUATION.key,
    choice_key: FIRST_CALL.key,
    won: true,
    score: 100,
    daring: 0,
    relics: [],
    ...over,
  };
}

function rounds(count: number, over: Partial<RoundSample> = {}): RoundSample[] {
  return Array.from({ length: count }, (_, index) => round(over, index));
}

function offers(count: number, over: Partial<OfferSample> = {}): OfferSample[] {
  return Array.from({ length: count }, () => ({
    round: 2,
    offered: [RELIC_A, RELIC_B, RELIC_C],
    taken: RELIC_A,
    ...over,
  }));
}

function relicIn(report: ReturnType<typeof buildBalanceReport>, key: string) {
  const found = report.relics.find((relic) => relic.key === key);
  expect(found, `relic ${key} missing from the report`).toBeDefined();
  return found!;
}

function choiceIn(report: ReturnType<typeof buildBalanceReport>, key: string) {
  const found = report.situations.flatMap((situation) => situation.choices).find((choice) => choice.key === key);
  expect(found, `choice ${key} missing from the report`).toBeDefined();
  return found!;
}

describe("the balance report", () => {
  it("reports nothing at all from an empty tape", () => {
    // A fresh season, a missing migration, a quiet week — all the same
    // shape, and none of them may produce a finding.
    const report = buildBalanceReport([], []);
    expect(report.rounds).toBe(0);
    expect(report.runs).toBe(0);
    expect(report.headlines).toEqual([]);
    for (const relic of report.relics) expect(relic.flags).toEqual(["thin"]);
  });

  it("lists every catalog relic and situation even when unseen", () => {
    // The report is a checklist, not a highlight reel: a relic nobody has
    // ever been offered is exactly the thing a balance pass wants to see.
    const report = buildBalanceReport(rounds(5), offers(5));
    expect(report.relics.length).toBeGreaterThanOrEqual(RELIC_CATALOG.length);
    expect(report.situations.length).toBe(CROSSROADS_CATALOG.length);
  });

  it("counts runs, not rounds", () => {
    const tape = [
      round({ run_id: 1, round: 1 }),
      round({ run_id: 1, round: 2 }),
      round({ run_id: 2, round: 1 }),
    ];
    const report = buildBalanceReport(tape, []);
    expect(report.rounds).toBe(3);
    expect(report.runs).toBe(2);
  });

  it("refuses to flag a thin sample", () => {
    // Three-for-three is three rounds, not a finding. This is the guard
    // that keeps a Monday-morning report from chasing noise.
    const tape = rounds(MIN_SAMPLE - 1, { choice_key: FIRST_CALL.key, relics: [RELIC_A] });
    const report = buildBalanceReport(tape, offers(MIN_SAMPLE - 1));
    expect(choiceIn(report, FIRST_CALL.key).flags).toEqual(["thin"]);
    expect(relicIn(report, RELIC_A).flags).toEqual(["thin"]);
    expect(report.headlines).toEqual([]);
  });

  it("calls a relic nobody takes dead", () => {
    // Offered 60 times, taken 6 — a fifth of its fair third.
    const taken = offers(6, { taken: RELIC_A });
    const passed = offers(54, { taken: RELIC_B });
    const tape = rounds(MIN_SAMPLE, { relics: [RELIC_A] });
    const report = buildBalanceReport(tape, [...taken, ...passed]);
    const relic = relicIn(report, RELIC_A);
    expect(relic.offered).toBe(60);
    expect(relic.taken).toBe(6);
    expect(relic.takeRate).toBeCloseTo(0.1, 5);
    expect(relic.flags).toContain("ignored");
    expect(report.headlines.join(" ")).toContain("DEAD RELIC");
  });

  it("calls a relic everyone takes dominant", () => {
    // RELIC_B rides along on the tape (carried in from before the window)
    // but is never taken inside it — the other side of the same coin.
    const tape = rounds(MIN_SAMPLE, { relics: [RELIC_A, RELIC_B] });
    const report = buildBalanceReport(tape, offers(60, { taken: RELIC_A }));
    expect(relicIn(report, RELIC_A).takeRate).toBe(1);
    expect(relicIn(report, RELIC_A).flags).toContain("dominant");
    expect(relicIn(report, RELIC_B).takeRate).toBe(0);
    expect(relicIn(report, RELIC_B).flags).toContain("ignored");
  });

  it("measures a relic's lift against the rounds it actually fought", () => {
    // THE confound this module exists to correct. A relic taken late only
    // ever fights round 8, where everyone loses. Raw win rate would call
    // it terrible; lift calls it exactly average, because it is.
    const early = rounds(60, { round: 1, won: true, relics: [] });
    const lateLosses = Array.from({ length: 40 }, (_, index) =>
      round({ run_id: 1000 + index, round: 8, won: index < 8, relics: [RELIC_A] }),
    );
    const report = buildBalanceReport([...early, ...lateLosses], offers(40));
    const relic = relicIn(report, RELIC_A);
    expect(relic.winRate).toBeCloseTo(0.2, 5); // brutal on its face
    expect(relic.lift).toBeCloseTo(0, 5); // and exactly par once you adjust
    expect(relic.flags).not.toContain("weak");
  });

  it("finds the trap: taken by everyone, loses anyway", () => {
    // Same round for everybody, so lift is pure performance.
    const withRelic = Array.from({ length: 60 }, (_, index) =>
      round({ run_id: index, round: 4, won: index < 12, relics: [RELIC_A] }),
    );
    const without = Array.from({ length: 60 }, (_, index) =>
      round({ run_id: 100 + index, round: 4, won: index < 48, relics: [RELIC_B] }),
    );
    const report = buildBalanceReport([...withRelic, ...without], offers(60, { taken: RELIC_A }));
    const relic = relicIn(report, RELIC_A);
    expect(relic.lift).toBeLessThan(-LIFT_BAND);
    expect(relic.flags).toEqual(expect.arrayContaining(["dominant", "weak", "trap"]));
    expect(report.headlines[0]).toContain("TRAP");
  });

  it("finds the sleeper: nobody takes it, it wins", () => {
    const withRelic = Array.from({ length: 60 }, (_, index) =>
      round({ run_id: index, round: 4, won: index < 54, relics: [RELIC_A] }),
    );
    const without = Array.from({ length: 240 }, (_, index) =>
      round({ run_id: 100 + index, round: 4, won: index < 120, relics: [RELIC_B] }),
    );
    const offered = [...offers(6, { taken: RELIC_A }), ...offers(54, { taken: RELIC_B })];
    const report = buildBalanceReport([...withRelic, ...without], offered);
    const relic = relicIn(report, RELIC_A);
    expect(relic.lift).toBeGreaterThan(LIFT_BAND);
    expect(relic.flags).toEqual(expect.arrayContaining(["ignored", "strong", "sleeper"]));
    expect(report.headlines.join(" ")).toContain("SLEEPER");
  });

  it("prices a choice against its own table, not against every choice", () => {
    // A situation with two lines has a fair share of 50%; one with four
    // has 25%. Flagging both at the same raw take rate would condemn
    // every choice in a wide situation.
    const report = buildBalanceReport(rounds(MIN_SAMPLE * 2), offers(1));
    const choice = choiceIn(report, FIRST_CALL.key);
    expect(choice.fairShare).toBeCloseTo(1 / SITUATION.choices.length, 5);
    expect(choice.takeRate).toBe(1);
    expect(choice.flags).toContain("dominant");
  });

  it("shares one denominator across a situation's choices", () => {
    // Every choice's `offered` is the number of times the SITUATION came
    // up — the only denominator a take rate can honestly use.
    const split = [
      ...rounds(40, { choice_key: FIRST_CALL.key }),
      ...rounds(40, { choice_key: SECOND_CALL.key }),
    ];
    const report = buildBalanceReport(split, []);
    for (const choice of report.situations.find((s) => s.key === SITUATION.key)!.choices) {
      expect(choice.offered).toBe(80);
    }
    expect(choiceIn(report, FIRST_CALL.key).takeRate).toBeCloseTo(0.5, 5);
  });

  it("reports the daring a call actually pays", () => {
    const tape = rounds(40, { choice_key: SECOND_CALL.key, daring: 30, score: 150 });
    const report = buildBalanceReport(tape, []);
    const choice = choiceIn(report, SECOND_CALL.key);
    expect(choice.avgDaring).toBe(30);
    expect(choice.avgScore).toBe(150);
  });

  it("publishes the per-round baseline it measured everything against", () => {
    // The report has to show its own work: a lift number is unreadable
    // without the baseline it was subtracted from.
    const tape = [
      ...rounds(10, { round: 1, won: true }),
      ...rounds(10, { round: 8, won: false }),
    ];
    const report = buildBalanceReport(tape, []);
    expect(report.baseline.map((row) => row.round)).toEqual([1, 8]);
    expect(report.baseline[0].winRate).toBe(1);
    expect(report.baseline[1].winRate).toBe(0);
  });

  it("keeps its thresholds in the order the flags assume", () => {
    // A guard on the constants themselves: ignored must sit below fair
    // and dominant above it, or every bucket gets both flags at once.
    expect(IGNORED_AT).toBeLessThan(1);
    expect(DOMINANT_AT).toBeGreaterThan(1);
    expect(LIFT_BAND).toBeGreaterThan(0);
  });

  it("never flags a relic on offers alone when it has never been fought", () => {
    // A relic offered 200 times and taken twice has a real take rate, but
    // two rounds of evidence. Both halves need a sample before the report
    // says anything about it.
    const report = buildBalanceReport(rounds(2, { relics: [RELIC_A] }), offers(200, { taken: RELIC_B }));
    expect(relicIn(report, RELIC_A).flags).toEqual(["thin"]);
  });
});
