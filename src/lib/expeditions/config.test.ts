import { readFileSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import type { CardCopy } from "./config";
import { DAILY_AMOUNT, DAILY_STREAK_MAX, DAILY_STREAK_STEP, MAXED_DAILY_STREAK } from "@/lib/betting/daily";
import { PACK_COST } from "@/lib/packs/config";
import {
  BRIEF_BONUS,
  briefFor,
  EXPEDITION_TIERS,
  expectedDailyDollars,
  DAILY_LAUNCHES,
  LOOT_MULT_CAP,
  MARK_RANK,
  MERCHANT_DOLLARS,
  maxExpeditionPayout,
  payoutRange,
  rollOutcome,
  SHINE_BONUS_CAP,
  shineOf,
  SURGE_BONUS,
  squadMeets,
  squadShine,
  TIER_ORDER,
} from "./config";

/** What one run of a tier is expected to pay — expectedDailyDollars with
 *  the per-day scaling taken back out, so a test can talk about a run. */
function perRunDollars(tier: "scout" | "raid" | "legend"): number {
  const perDay = expectedDailyDollars(tier);
  return perDay / Math.min(24 / EXPEDITION_TIERS[tier].durationHours, DAILY_LAUNCHES);
}

// A fixture, not a real row: shineOf reads seven of card_inventory's columns
// and a test that had to build a whole PlayerCardData to say "a gold card"
// would hide what each case is about. Keys are checked against CardCopy;
// values are deliberately loose so `card: { moment: {} }` can stand in for a
// pulled moment.
const copy = (over: Partial<Record<keyof CardCopy, unknown>> = {}) =>
  ({
    id: 1,
    tier: "gold",
    foil: false,
    foilType: null,
    signed: false,
    role: "Mid",
    card: {},
    ...over,
  }) as unknown as CardCopy;

describe("shineOf", () => {
  it("scores tier base by ladder index", () => {
    expect(shineOf(copy({ tier: "bronze" }))).toBe(1);
    expect(shineOf(copy({ tier: "challenger" }))).toBe(8);
  });
  it("adds parallel and signature bonuses", () => {
    expect(shineOf(copy({ tier: "gold", foil: true, foilType: "ice" }))).toBe(3 + 4);
    expect(shineOf(copy({ tier: "gold", signed: true }))).toBe(3 + 4);
    expect(shineOf(copy({ tier: "gold", foil: true, foilType: "prisma", signed: true }))).toBe(3 + 1 + 4);
  });
  it("scores relics and moments flat 6", () => {
    expect(shineOf(copy({ card: { champWin: {} } }))).toBe(6);
    expect(shineOf(copy({ card: { moment: {} } }))).toBe(6);
  });
  it("prices an unrecognized tier as the bottom of the ladder", () => {
    expect(shineOf(copy({ tier: "mythic" }))).toBe(1);
  });
  it("sums a squad", () => {
    expect(squadShine([copy({ tier: "bronze" }), copy({ tier: "gold" })])).toBe(1 + 3);
  });
});

describe("squadMeets", () => {
  it("legend needs 2 foils, 1 signed, shine 20", () => {
    const squad = [
      copy({ tier: "diamond", foil: true, foilType: "ice" }),      // 6+4 = 10
      copy({ tier: "master", foil: true, foilType: "refractor" }), // 7+3 = 10
      copy({ tier: "gold", signed: true }),                        // 3+4 = 7
    ];
    expect(squadMeets("legend", squad).ok).toBe(true);
  });
  it("reports every unmet requirement by name", () => {
    const { ok, reasons } = squadMeets("legend", [copy({}), copy({}), copy({})]);
    expect(ok).toBe(false);
    expect(reasons.join(" ")).toMatch(/foil/i);
    expect(reasons.join(" ")).toMatch(/signed/i);
    expect(reasons.join(" ")).toMatch(/shine/i);
  });
  it("rejects squads that are not exactly three", () => {
    expect(squadMeets("scout", [copy({}), copy({})]).ok).toBe(false);
  });
  it("lets any three cards run a scouting run", () => {
    const { ok, reasons } = squadMeets("scout", [copy({ tier: "bronze" }), copy({ tier: "bronze" }), copy({ tier: "bronze" })]);
    expect(ok).toBe(true);
    expect(reasons).toEqual([]);
  });
});

describe("EXPEDITION_TIERS", () => {
  it("gates harder the longer the run", () => {
    expect(EXPEDITION_TIERS.scout.durationHours).toBe(8);
    expect(EXPEDITION_TIERS.raid.durationHours).toBe(24);
    expect(EXPEDITION_TIERS.legend.durationHours).toBe(48);
    expect(EXPEDITION_TIERS.legend.minShine).toBeGreaterThan(EXPEDITION_TIERS.raid.minShine);
    expect(EXPEDITION_TIERS.raid.minShine).toBeGreaterThan(EXPEDITION_TIERS.scout.minShine);
  });
  it("pays under a pack a day at every tier, comps included", () => {
    // The balance guardrail: expeditions supplement the economy, never
    // replace it. See the arithmetic on REWARDS.
    expect(expectedDailyDollars("scout")).toBeCloseTo(77.5, 2);
    expect(expectedDailyDollars("raid")).toBeCloseTo(271, 2);
    expect(expectedDailyDollars("legend")).toBeCloseTo(543.75, 2);
    // The guardrail: a click of /daily must never be the worse option, and
    // an expedition must never be the better one. Nothing on the board
    // out-earns a maxed daily streak on base rates.
    for (const tier of TIER_ORDER) {
      expect(expectedDailyDollars(tier)).toBeLessThan(MAXED_DAILY_STREAK);
    }
    // The Legendary route is three days and three fragments; even so its
    // base rate stays under the streak, and the forks — where its money
    // is — are paid for in risk.
    expect(expectedDailyDollars("legendary")).toBeLessThan(MAXED_DAILY_STREAK);
    expect(expectedDailyDollars("exorcism")).toBe(0);
    // The scouting run is the one anybody can field with any three cards,
    // so it keeps the stricter original rule as well: an ungated loop must
    // never pay for a pack a day.
    expect(expectedDailyDollars("scout")).toBeLessThan(PACK_COST);
    // And the ladder has to climb, or the gates ask for foils and signatures
    // in exchange for nothing.
    expect(expectedDailyDollars("scout")).toBeLessThan(expectedDailyDollars("raid"));
    expect(expectedDailyDollars("raid")).toBeLessThan(expectedDailyDollars("legend"));
  });

  it("measures itself against what /daily actually pays", () => {
    // Not a restated number: the guardrail imports the same constant the
    // handler pays out, so retuning /daily moves the ceiling with it.
    expect(MAXED_DAILY_STREAK).toBe(DAILY_AMOUNT + DAILY_STREAK_STEP * (DAILY_STREAK_MAX - 1));
    expect(MAXED_DAILY_STREAK).toBe(550);
  });

  it("prices a day by launches allowed, not only by run length", () => {
    // The bug in the first pass: three eight-hour runs fit in a day, but
    // launch_expedition permits one. A scouting day is one scouting run.
    expect(expectedDailyDollars("scout")).toBeCloseTo(perRunDollars("scout"), 2);
    // A 48h run still lands every other day, so it counts as half of one.
    expect(expectedDailyDollars("legend")).toBeCloseTo(perRunDollars("legend") / 2, 2);
  });
  it("ranks marks worst to best", () => {
    expect(MARK_RANK.trail).toBeLessThan(MARK_RANK.sigil);
    expect(MARK_RANK.sigil).toBeLessThan(MARK_RANK.legend);
  });
});

describe("briefFor", () => {
  it("is deterministic per date and varies across dates", () => {
    expect(briefFor("2026-08-27")).toEqual(briefFor("2026-08-27"));
    const keys = new Set(["2026-08-27", "2026-08-28", "2026-08-29", "2026-08-30", "2026-08-31"].map((d) => briefFor(d).key));
    expect(keys.size).toBeGreaterThan(1);
  });
  it("names a role cards are actually printed with", () => {
    expect(["Top", "Jungle", "Mid", "Bot", "Support"]).toContain(briefFor("2026-08-27").role);
  });
});

describe("rollOutcome", () => {
  it("never pays below the tier floor and never marks above the tier ceiling", () => {
    for (let i = 0; i < 200; i += 1) {
      const out = rollOutcome("scout", 6, [{ role: "MID" }, { role: "TOP" }, { role: "BOT" }], "2026-08-27", Math.random);
      expect(out.dollars).toBeGreaterThan(0);
      expect(out.mark === null || out.mark === "trail").toBe(true);
      expect(out.comp).toBe(false); // scout never comps
    }
  });
  it("legend jackpot carries the legend mark", () => {
    const out = rollOutcome("legend", 30, [{ role: "MID" }, { role: "TOP" }, { role: "BOT" }], "2026-08-27", () => 0.999);
    // rand pinned high → jackpot branch (implement so the top of the range is jackpot)
    expect(out.grade).toBe("jackpot");
    expect(out.mark).toBe("legend");
  });
  it("applies the brief bonus when the squad satisfies it", () => {
    const brief = briefFor("2026-08-27");
    const withRole = rollOutcome("raid", 15, [{ role: brief.role }, { role: "X" }, { role: "X" }], "2026-08-27", () => 0.5);
    const without = rollOutcome("raid", 15, [{ role: "X" }, { role: "X" }, { role: "X" }], "2026-08-27", () => 0.5);
    expect(withRole.briefHit).toBe(true);
    expect(withRole.dollars).toBeGreaterThan(without.dollars);
  });
  it("pins the bottom of the range to poor and pays more with shine", () => {
    const squad = [{ role: "X" }, { role: "X" }, { role: "X" }];
    const flat = rollOutcome("raid", 12, squad, "2026-08-27", () => 0);
    const shiny = rollOutcome("raid", 40, squad, "2026-08-27", () => 0);
    expect(flat.grade).toBe("poor");
    expect(shiny.dollars).toBeGreaterThan(flat.dollars);
    // The shine bonus caps at +50%, so a monster squad cannot run away with
    // it. Measured against the un-bonused roll rather than a copy of the
    // table's number, so a balance pass can't quietly break the cap.
    expect(shiny.dollars).toBe(Math.round(flat.dollars * 1.5));
  });
  it("consumes rand in a fixed order: grade, comp, mark", () => {
    const queue = [0.999, 0.5, 0.99];
    let used = 0;
    const rand = () => queue[used++] ?? 0;
    const out = rollOutcome("raid", 0, [{ role: "X" }, { role: "X" }, { role: "X" }], "2026-08-27", rand);
    expect(out.grade).toBe("jackpot");
    expect(out.comp).toBe(false); // 0.5 misses the 25% comp roll
    expect(out.mark).toBe(null);  // 0.99 misses the 30% sigil roll
    expect(used).toBe(3);
  });
  it("skips the rand a certain outcome does not need", () => {
    let used = 0;
    const rand = () => {
      used += 1;
      return 0; // poor grade: no comp chance, no mark chance
    };
    rollOutcome("scout", 0, [{ role: "X" }, { role: "X" }, { role: "X" }], "2026-08-27", rand);
    expect(used).toBe(1);
  });
});


describe("the payout ceiling the claim RPC guards", () => {
  /** The live guard, read out of the migration that last defined it. */
  function guardCeiling(): number {
    // resolve_expedition is the live claim; the old claim_expedition guard
    // (20260906000001) stays behind for the runs that pre-date forks.
    const sql = readFileSync(
      join(process.cwd(), "supabase/migrations/20260916000001_expedition_matchday.sql"),
      "utf8",
    );
    const match = sql.match(/v_dollars not between 0 and (\d+)/);
    expect(match, "the claim guard is not where the test expects it").not.toBeNull();
    return Number(match![1]);
  }

  it("is high enough to pay a maxed legend jackpot", () => {
    // THE BUG this test exists for. The guard shipped as a flat 2,000 —
    // which is the legend jackpot's BASE, not its maximum — so a squad one
    // point over the gate rolled 2,060 and the claim died with a generic
    // "something went wrong". And because rollOutcome re-rolls on every
    // attempt, clicking again paid a LOWER grade and closed the run: the
    // rarest outcome in the feature was the only one that could not be
    // paid, and retrying destroyed it.
    expect(guardCeiling()).toBeGreaterThanOrEqual(maxExpeditionPayout());
  });

  it("matches the config exactly, so the two cannot drift again", () => {
    // The real lesson is not the number. It is that a TypeScript constant
    // and a SQL literal described the same rule with nothing holding them
    // together. Raising a tier's dollars, the shine cap or the brief bonus
    // now fails here until the guard follows.
    expect(guardCeiling()).toBe(maxExpeditionPayout());
  });

  it("derives the ceiling rather than restating it", () => {
    // best base x shine cap x brief bonus — read off REWARDS, so this
    // stays true through a rebalance.
    const best = Math.max(...TIER_ORDER.map((tier) => payoutRange(tier).max));
    expect(maxExpeditionPayout()).toBe(Math.round(best * (1 + SHINE_BONUS_CAP) * (1 + BRIEF_BONUS) * LOOT_MULT_CAP * (1 + SURGE_BONUS)) + MERCHANT_DOLLARS);
  });

  it("still refuses a payout no roll could produce", () => {
    // The guard is open_card_pack's p_cost discipline: a caller may write
    // only a number the config could actually have produced. Widening it
    // to the true ceiling must not turn it into no guard at all.
    expect(guardCeiling()).toBeLessThan(maxExpeditionPayout() * 2);
  });
});
