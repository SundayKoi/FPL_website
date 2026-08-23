import { describe, expect, it } from "vitest";
import { WEEKLY_PAYOUTS } from "./config";
import { planPayouts, type PayoutEntry } from "./payouts";

function entry(discordId: string, score: number): PayoutEntry {
  return { discordId, score };
}

describe("planPayouts", () => {
  it("pays the top three by default, in WEEKLY_PAYOUTS order", () => {
    const plans = planPayouts([
      entry("a", 210.5),
      entry("b", 260.1),
      entry("c", 180.9),
      entry("d", 240),
    ]);
    expect(plans).toEqual([
      { discordId: "b", rank: 1, amount: WEEKLY_PAYOUTS[0] },
      { discordId: "d", rank: 2, amount: WEEKLY_PAYOUTS[1] },
      { discordId: "a", rank: 3, amount: WEEKLY_PAYOUTS[2] },
    ]);
  });

  it("sorts for itself — the caller's order doesn't decide the podium", () => {
    const ascending = planPayouts([entry("c", 10), entry("b", 20), entry("a", 30)]);
    expect(ascending.map((plan) => plan.discordId)).toEqual(["a", "b", "c"]);
  });

  it("leaves the lower tiers unpaid when fewer entries than payout slots", () => {
    const plans = planPayouts([entry("a", 120), entry("b", 90)]);
    expect(plans).toEqual([
      { discordId: "a", rank: 1, amount: WEEKLY_PAYOUTS[0] },
      { discordId: "b", rank: 2, amount: WEEKLY_PAYOUTS[1] },
    ]);
  });

  it("excludes zero and negative scores even when that leaves the podium short", () => {
    const plans = planPayouts([entry("a", 0), entry("b", 55), entry("c", 0), entry("d", -3)]);
    expect(plans).toEqual([{ discordId: "b", rank: 1, amount: WEEKLY_PAYOUTS[0] }]);
  });

  it("pays nobody when every entry scored zero", () => {
    expect(planPayouts([entry("a", 0), entry("b", 0)])).toEqual([]);
  });

  it("breaks ties by input order, without splitting the amounts", () => {
    const plans = planPayouts([entry("early", 100), entry("late", 100), entry("third", 100)]);
    expect(plans).toEqual([
      { discordId: "early", rank: 1, amount: WEEKLY_PAYOUTS[0] },
      { discordId: "late", rank: 2, amount: WEEKLY_PAYOUTS[1] },
      { discordId: "third", rank: 3, amount: WEEKLY_PAYOUTS[2] },
    ]);
  });

  it("keeps tie order regardless of where the tied pair sits in the input", () => {
    const plans = planPayouts([entry("tie-a", 50), entry("winner", 90), entry("tie-b", 50)]);
    expect(plans.map((plan) => plan.discordId)).toEqual(["winner", "tie-a", "tie-b"]);
  });

  it("returns nothing for an empty week", () => {
    expect(planPayouts([])).toEqual([]);
  });

  it("honors a custom payout table", () => {
    const plans = planPayouts([entry("a", 9), entry("b", 8), entry("c", 7)], [1000]);
    expect(plans).toEqual([{ discordId: "a", rank: 1, amount: 1000 }]);
  });

  it("drops non-positive tiers, which fantasy_payout would reject", () => {
    const plans = planPayouts([entry("a", 9), entry("b", 8), entry("c", 7)], [500, 0, -10]);
    expect(plans).toEqual([{ discordId: "a", rank: 1, amount: 500 }]);
  });

  it("pays nobody when the payout table is empty", () => {
    expect(planPayouts([entry("a", 9)], [])).toEqual([]);
  });
});
