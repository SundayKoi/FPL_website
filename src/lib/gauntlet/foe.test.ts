import { describe, expect, it } from "vitest";
import {
  BEAT_VALUE,
  beatOfKeys,
  DESPERATE_AT,
  CLOSING_AT,
  FOCUS_FLAT,
  FOCUS_MARGIN,
  FOE_PLANS,
  FOE_PLAN_BY_KEY,
  foeCrossroadsEdge,
  foeEdge,
  foePlanEvent,
  planValue,
  readLanes,
  rollFoePlan,
  SWING,
  ZERO_SUM_TOLERANCE,
  type FoeBeat,
} from "./foe";
import { CROSSROADS_CATALOG } from "./crossroads";
import { generateOpponent, weekSeed } from "./opponents";
import { aggregateEffects } from "./relics";
import { aggregateTraits, conditionEffects } from "./traits";
import {
  GAUNTLET_ROLES,
  type GauntletCard,
  type GauntletRole,
  type MatchContext,
  mulberry32,
  simulateMatch,
} from "./sim";

const BEATS: FoeBeat[] = ["lane", "objective", "fight", "baron", "hold", "crossroads"];

function flat(avg: number): GauntletCard[] {
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
  }));
}

function lane(role: GauntletRole, margin: number) {
  return { role, won: margin > 0, margin };
}

describe("the opponent's game plan", () => {
  it("points them without making them stronger", () => {
    // THE contract of this whole module. A plan reallocates: what it adds
    // on one beat it gives up on others, priced by BEAT_VALUE — the
    // measured worth of a stat point on each beat, not a count of checks.
    // Get this wrong and "smarter enemies" is just "harder enemies".
    for (const plan of FOE_PLANS) {
      expect(Math.abs(planValue(plan.beats)), `${plan.key} is worth ${planValue(plan.beats).toFixed(3)}`)
        .toBeLessThanOrEqual(ZERO_SUM_TOLERANCE);
    }
  });

  it("balances the desperation swing on the same scale", () => {
    expect(Math.abs(planValue(SWING))).toBeLessThanOrEqual(ZERO_SUM_TOLERANCE);
  });

  it("makes every plan a real trade", () => {
    // A plan that only adds is a buff wearing a costume; one that only
    // subtracts is a gift. Each has to do both.
    for (const plan of FOE_PLANS) {
      const weights = Object.values(plan.beats);
      expect(weights.some((weight) => weight > 0), `${plan.key} adds nothing`).toBe(true);
      expect(weights.some((weight) => weight < 0), `${plan.key} gives up nothing`).toBe(true);
    }
  });

  it("tells the player what it is and how to beat it", () => {
    // Same contract every trait and condition keeps: a modifier you can
    // only discover by losing to it is a tax, not a read.
    for (const plan of FOE_PLANS) {
      expect(plan.title.length).toBeGreaterThan(4);
      expect(plan.tell.length).toBeGreaterThan(20);
      expect(plan.counter.length).toBeGreaterThan(20);
    }
    expect(new Set(FOE_PLANS.map((plan) => plan.key)).size).toBe(FOE_PLANS.length);
  });

  it("weights only beats the engine actually runs", () => {
    for (const plan of FOE_PLANS) {
      for (const beat of Object.keys(plan.beats)) {
        expect(BEATS, `${plan.key} weights an unknown beat`).toContain(beat);
      }
    }
    expect(Object.keys(BEAT_VALUE).sort()).toEqual([...BEATS].sort());
  });
});

describe("rolling the plan", () => {
  it("is a pure function of the seed, so the whole league scouts the same enemy", () => {
    // The week's cast is shared. A plan drawn from the fight's own RNG
    // would give two players the same five with different brains.
    for (let seed = 1; seed < 50; seed += 1) {
      expect(rollFoePlan(mulberry32(seed))).toBe(rollFoePlan(mulberry32(seed)));
    }
  });

  it("draws all four across a season of weeks", () => {
    const seen = new Set<string>();
    for (let week = 0; week < 200; week += 1) seen.add(rollFoePlan(mulberry32(week * 977 + 3)));
    expect(seen.size).toBe(FOE_PLANS.length);
  });

  it("rides on the generated opponent, where the scouting card can read it", () => {
    const opponent = generateOpponent(74, 3, mulberry32(weekSeed("2026-08-24", 3)));
    expect(opponent.plan).toBeDefined();
    expect(FOE_PLAN_BY_KEY.has(opponent.plan!)).toBe(true);
    // And it is stable: same week, same round, same brain.
    expect(generateOpponent(74, 3, mulberry32(weekSeed("2026-08-24", 3))).plan).toBe(opponent.plan);
  });
});

describe("the lane read", () => {
  it("finds the lane that lost and the lane that won", () => {
    const read = readLanes([
      lane("Top", -20), lane("Jungle", 3), lane("Mid", 14), lane("Bot", -4), lane("Support", 1),
    ]);
    expect(read.focusRole).toBe("Top");
    expect(read.fedRole).toBe("Mid");
  });

  it("ignores a coin flip", () => {
    // Reading a one-point lane as a weakness is the enemy hallucinating,
    // not thinking.
    const read = readLanes(GAUNTLET_ROLES.map((role, index) => lane(role, index % 2 === 0 ? 2 : -2)));
    expect(read.focusRole).toBeNull();
    expect(read.fedRole).toBeNull();
  });

  it("takes the worst loss, not the first one", () => {
    const read = readLanes([lane("Top", -FOCUS_MARGIN), lane("Bot", -30), lane("Mid", -12)]);
    expect(read.focusRole).toBe("Bot");
  });

  it("reads an empty lane phase as no read at all", () => {
    expect(readLanes([])).toEqual({ focusRole: null, fedRole: null });
  });
});

describe("what they add to a check", () => {
  it("adds nothing at all without a plan or a read", () => {
    // Every run staged before this shipped still fights the old flat
    // opponent — no silent difficulty change on a live week.
    for (const beat of BEATS) {
      expect(foeEdge(undefined, beat, { momentum: 50 })).toBe(0);
      expect(foeEdge(null, beat, { momentum: 50 })).toBe(0);
    }
  });

  it("collapses on the losing lane and gives ground to the winning one", () => {
    const board = { momentum: 50, focusRole: "Top" as GauntletRole, fedRole: "Mid" as GauntletRole };
    expect(foeEdge(null, "fight", { ...board, role: "Top" })).toBeCloseTo(FOCUS_FLAT, 6);
    expect(foeEdge(null, "fight", { ...board, role: "Mid" })).toBeCloseTo(-FOCUS_FLAT, 6);
    // What they take from one, they give to the other — exactly.
    expect(
      foeEdge(null, "fight", { ...board, role: "Top" }) + foeEdge(null, "fight", { ...board, role: "Mid" }),
    ).toBeCloseTo(0, 6);
    expect(foeEdge(null, "fight", { ...board, role: "Bot" })).toBe(0);
  });

  it("forces the map when behind and closes when ahead", () => {
    const behind = { momentum: DESPERATE_AT + 5 };
    const ahead = { momentum: CLOSING_AT - 5 };
    expect(foeEdge(null, "baron", behind)).toBeGreaterThan(0);
    expect(foeEdge(null, "hold", behind)).toBeLessThan(0);
    expect(foeEdge(null, "baron", ahead)).toBeLessThan(0);
    expect(foeEdge(null, "hold", ahead)).toBeGreaterThan(0);
    // And the two states are exact mirrors of each other.
    for (const beat of BEATS) {
      expect(foeEdge(null, beat, behind) + foeEdge(null, beat, ahead)).toBeCloseTo(0, 6);
    }
  });

  it("does nothing in the middle of the board", () => {
    for (const beat of BEATS) {
      expect(foeEdge(null, beat, { momentum: 50 })).toBe(0);
    }
  });
});

describe("the call at minute 20", () => {
  it("reads which line you took", () => {
    // A team that wants the fight is STRONGER when you fight them and
    // weaker when you walk away — which is what makes the tell on the
    // scouting card worth reading.
    const board = { momentum: 50 };
    const intoThem = foeCrossroadsEdge("brawl", ["combat", "damage"], board);
    const awayFromThem = foeCrossroadsEdge("brawl", ["objectives", "vision"], board);
    expect(intoThem).toBeGreaterThan(awayFromThem);
    expect(awayFromThem).toBeLessThan(intoThem - 3);
  });

  it("prices a straggler-hunter's anticipation on every line", () => {
    // THEY HUNT STRAGGLERS is about the moment, not the line — so its
    // weight applies whatever you pick.
    for (const keys of [["combat"], ["objectives"], ["turrets"]] as const) {
      expect(foeCrossroadsEdge("pick", [...keys], { momentum: 50 })).toBeGreaterThan(0);
    }
  });

  it("never counts the same tell twice", () => {
    // A line defended with nothing in particular already reads as the
    // crossroads beat; adding the anticipation on top of itself would
    // price one read as two.
    expect(foeCrossroadsEdge("pick", ["economy"], { momentum: 50 })).toBeCloseTo(
      FOE_PLAN_BY_KEY.get("pick")!.beats.crossroads!,
      6,
    );
  });

  it("adds nothing without a plan", () => {
    expect(foeCrossroadsEdge(undefined, ["combat"], { momentum: 50 })).toBe(0);
  });

  it("classifies every real crossroads line", () => {
    // Every shipped choice has to land on a beat the plans can weight,
    // or a new situation silently opts out of the opponent's brain.
    for (const situation of CROSSROADS_CATALOG) {
      for (const choice of situation.choices) {
        if (choice.theirKeys.length === 0) continue;
        expect(BEATS).toContain(beatOfKeys(choice.theirKeys));
      }
    }
  });
});

describe("the plan on the tape", () => {
  it("states itself, so a player who skipped scouting is still told", () => {
    const line = foePlanEvent("siege");
    expect(line?.text).toContain(FOE_PLAN_BY_KEY.get("siege")!.title);
    expect(line?.detail.length).toBeGreaterThan(20);
  });

  it("says nothing when there is no plan", () => {
    expect(foePlanEvent(undefined)).toBeNull();
  });
});

describe("calibration — a thinking enemy is not a harder one", () => {
  /** The same 74-average lineup against the same shipped bracket, once
   *  per plan, on identical seeds. Only the brain changes. */
  function winRate(plan: string | undefined, runs: number): number {
    let won = 0;
    let played = 0;
    for (let run = 0; run < runs; run += 1) {
      for (let round = 1; round <= 8; round += 1) {
        const opponent = generateOpponent(74, round, mulberry32(weekSeed("2026-08-24", round) + run));
        const ctx = {
          effects: aggregateEffects([]),
          foe: aggregateTraits(opponent.traits ?? []),
          arena: conditionEffects(opponent.condition),
          plan,
        } as MatchContext;
        if (simulateMatch(flat(74), opponent.cards, ctx, mulberry32(run * 31 + round * 7)).won) won += 1;
        played += 1;
      }
    }
    return (100 * won) / played;
  }

  it("moves the win rate by less than a point, whichever plan they bring", () => {
    // The measured table, at 6,000 runs (48,000 matches) per arm:
    //   no plan   40.313%
    //   objective 40.758%   +0.446
    //   brawl     40.592%   +0.279
    //   siege     40.235%   -0.077
    //   pick      40.415%   +0.102
    // Shrunk here to keep the suite quick; the band is wide enough for
    // the smaller sample and still fails on a real regression. Re-run at
    // 6,000 before touching any weight in FOE_PLANS.
    const RUNS = 700;
    const base = winRate(undefined, RUNS);
    for (const plan of FOE_PLANS) {
      const delta = winRate(plan.key, RUNS) - base;
      expect(Math.abs(delta), `${plan.key} moved the win rate by ${delta.toFixed(2)} points`).toBeLessThan(2);
    }
  }, 120000);

  it("still changes the game it is not changing the difficulty of", () => {
    // The point of the whole exercise: same seeds, same cards, different
    // fights. A plan that measures identical to no plan is decoration.
    // Averaged over several opponents so the number is a property of the
    // mechanism rather than of one generated five.
    let differed = 0;
    let played = 0;
    for (let round = 1; round <= 8; round += 1) {
      const opponent = generateOpponent(74, round, mulberry32(weekSeed("2026-08-24", round)));
      const ctxFor = (plan?: string) =>
        ({
          effects: aggregateEffects([]),
          foe: aggregateTraits(opponent.traits ?? []),
          arena: conditionEffects(opponent.condition),
          plan,
        }) as MatchContext;
      for (let seed = 1; seed <= 60; seed += 1) {
        const bare = simulateMatch(flat(74), opponent.cards, ctxFor(), mulberry32(seed * round));
        const brawl = simulateMatch(flat(74), opponent.cards, ctxFor("brawl"), mulberry32(seed * round));
        if (bare.won !== brawl.won || bare.momentum !== brawl.momentum) differed += 1;
        played += 1;
      }
    }
    // Measured around a third of matches. A check only flips when the
    // reallocation lands inside the noise band, which is exactly the
    // texture wanted — a different fight, not a different bracket.
    expect(differed / played).toBeGreaterThan(0.15);
  });
});
