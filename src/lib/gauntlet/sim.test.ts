import { describe, expect, it } from "vitest";
import {
  compProfileOf,
  compStyleOf,
  FRESH_LEGS_BONUS,
  GAUNTLET_ROLES,
  type GauntletCard,
  daringForRound,
  goldEdge,
  lineupShapeOf,
  makeTrialist,
  type MatchContext,
  mulberry32,
  previewCrossroadsChoice,
  roundScore,
  simulateFirstHalf,
  simulateMatch,
  simulateSecondHalf,
  statOf,
} from "./sim";
import { contestDetail, runContest } from "./contest";
import {
  CROSSROADS_BY_KEY,
  CROSSROADS_CATALOG,
  CROSSROADS_SPREAD,
  crossroadsSpread,
  daringAt,
  safeChoiceOf,
  situationFor,
  winChanceOf,
} from "./crossroads";
import {
  aggregateEffects,
  offerRelics,
  rarityWeights,
  RELIC_CATALOG,
  type RelicDef,
} from "./relics";
import {
  aggregateTraits,
  CONDITION_CATALOG,
  conditionEffects,
  rollCondition,
  rollTraits,
  TRAIT_CATALOG,
  traitCountFor,
} from "./traits";
import { buildAutopsy } from "./autopsy";
import { bracketTarget, generateOpponent, LEAGUE_BASELINE } from "./opponents";

/** A five-card team at one flat rating, stats shaped by `shape`. */
function team(overall: number, shape: Partial<Record<string, number>> = {}): GauntletCard[] {
  return GAUNTLET_ROLES.map((role, index) => ({
    inventoryId: index + 1,
    name: `${role} ${overall}`,
    role,
    overall,
    stats: Object.fromEntries(
      ["combat", "damage", "economy", "laning", "vision", "objectives", "turrets", "survival", "presence", "impact"].map(
        (key) => [key, shape[key] ?? overall],
      ),
    ),
    foil: false,
    signed: false,
    fresh: false,
  }));
}

/** A five committed to one identity: the hot bars up, the rest down, so
 *  the AVERAGE is unchanged and only the shape differs. */
function shapedTeam(overall: number, hot: string[], org?: string): GauntletCard[] {
  return team(overall).map((card) => ({
    ...card,
    team: org ?? null,
    stats: Object.fromEntries(
      Object.keys(card.stats).map((key) => [key, hot.includes(key) ? overall + 10 : overall - 4]),
    ),
  }));
}

/** The bare arena: no relics, no traits, standard patch. */
const bare = (): MatchContext => ({ effects: {}, foe: {}, arena: {} });

describe("mulberry32", () => {
  it("is deterministic per seed and different across seeds", () => {
    const a1 = mulberry32(42);
    const a2 = mulberry32(42);
    const b = mulberry32(43);
    const runA1 = [a1(), a1(), a1()];
    const runA2 = [a2(), a2(), a2()];
    const runB = [b(), b(), b()];
    expect(runA1).toEqual(runA2);
    expect(runA1).not.toEqual(runB);
    for (const value of runA1) expect(value).toBeGreaterThanOrEqual(0);
    for (const value of runA1) expect(value).toBeLessThan(1);
  });
});

describe("statOf", () => {
  it("reads the real bar, falls back near overall, and adds Fresh Legs", () => {
    const card = team(70)[0];
    expect(statOf(card, "combat")).toBe(70);
    const bareCard: GauntletCard = { ...card, stats: {} };
    expect(statOf(bareCard, "combat")).toBe(65);
    const fresh: GauntletCard = { ...card, fresh: true };
    expect(statOf(fresh, "combat")).toBe(70 + FRESH_LEGS_BONUS);
  });

  it("never reads foil or ink — cosmetics stay cosmetic in the fight", () => {
    const plain = team(70)[0];
    const shiny: GauntletCard = { ...plain, foil: true, signed: true };
    for (const key of ["combat", "damage", "survival", "impact"] as const) {
      expect(statOf(shiny, key)).toBe(statOf(plain, key));
    }
  });
});

describe("compStyleOf", () => {
  it("reads the stat shape as an identity", () => {
    expect(compStyleOf(team(70, { damage: 90, laning: 88 }))).toBe("poke");
    expect(compStyleOf(team(70, { combat: 92, presence: 90 }))).toBe("dive");
    expect(compStyleOf(team(70, { survival: 93, vision: 91 }))).toBe("protect");
  });

  it("profiles the same three numbers the identity reads", () => {
    const profile = compProfileOf(team(70, { damage: 90, laning: 88 }));
    expect(profile.poke).toBe(89);
    expect(profile.dive).toBe(70);
    expect(profile.protect).toBe(70);
  });
});

describe("runContest", () => {
  it("records the margin the comparison actually used", () => {
    const contest = runContest(
      {
        key: "t", kind: "objective", label: "Test", clock: 14,
        yourKeys: ["objectives"], theirKeys: ["objectives"],
        yourVal: 70, theirVal: 66, spread: 0,
      },
      () => 0.5, // a zero roll
    );
    expect(contest.roll).toBe(0);
    expect(contest.margin).toBe(4);
    expect(contest.won).toBe(true);
    expect(contestDetail(contest)).toContain("70");
    expect(contestDetail(contest)).toContain("+4");
  });

  it("ties go to your side, and the roll sits inside the spread", () => {
    const even = runContest(
      { key: "t", kind: "fight", label: "T", clock: 1, yourKeys: [], theirKeys: [], yourVal: 50, theirVal: 50, spread: 0 },
      () => 0.5,
    );
    expect(even.won).toBe(true);
    for (let seed = 0; seed < 50; seed += 1) {
      const rand = mulberry32(seed);
      const contest = runContest(
        { key: "t", kind: "fight", label: "T", clock: 1, yourKeys: [], theirKeys: [], yourVal: 50, theirVal: 50, spread: 20 },
        rand,
      );
      expect(Math.abs(contest.roll)).toBeLessThanOrEqual(10);
    }
  });
});

describe("traits and conditions", () => {
  it("is a catalog of shapes, not stat sticks — every trait pays for itself", () => {
    for (const trait of TRAIT_CATALOG) {
      const values = Object.entries(trait.effects)
        .filter(([key]) => key !== "goldMult")
        .map(([, value]) => value as number);
      const total = values.reduce((sum, value) => sum + value, 0);
      // The bound that matters is the UPPER one: no trait may hand the
      // enemy free power. Net-negative traits are fine — that's the
      // enemy's problem, and the shape is still the point.
      // SCRIM GODS is the deliberate exception: small, flat, everywhere.
      const cap = trait.key === "scrim_gods" ? 6 : 4;
      expect(total, `${trait.key} nets ${total}`).toBeLessThanOrEqual(cap);
      expect(total, `${trait.key} nets ${total}`).toBeGreaterThanOrEqual(-8);
      expect(trait.counter.length).toBeGreaterThan(10);
    }
  });

  it("aggregates flats additively and gold multiplicatively", () => {
    const fx = aggregateTraits(["pit_bullies", "brawlers", "vultures"]);
    expect(fx.objectivesFlat).toBe(9);
    expect(fx.fightFlat).toBe(-6 + 8 - 5);
    expect(fx.lanesFlat).toBe(-6);
    expect(fx.goldMult).toBeCloseTo(1.35);
  });

  it("wears more traits as the bracket climbs, without duplicates", () => {
    expect(traitCountFor(1)).toBe(1);
    expect(traitCountFor(4)).toBe(2);
    expect(traitCountFor(8)).toBe(3);
    for (let round = 1; round <= 8; round += 1) {
      const rolled = rollTraits(round, mulberry32(round * 13));
      expect(rolled).toHaveLength(traitCountFor(round));
      expect(new Set(rolled).size).toBe(rolled.length);
    }
  });

  it("keeps round 1 on the standard patch and rolls a real one after", () => {
    expect(rollCondition(1, mulberry32(5))).toBe("standard");
    for (let round = 2; round <= 8; round += 1) {
      expect(rollCondition(round, mulberry32(round))).not.toBe("standard");
    }
    expect(conditionEffects("blood_moon").fightSwingMult).toBe(1.5);
    expect(conditionEffects(null)).toEqual({});
    expect(conditionEffects("nonsense")).toEqual({});
    for (const condition of CONDITION_CATALOG) expect(condition.tip.length).toBeGreaterThan(10);
  });
});

describe("lineupShapeOf", () => {
  it("reads commitment as how far the identity outruns the runner-up", () => {
    const flat = lineupShapeOf(team(74));
    expect(flat.commitment).toBe(0);
    expect(flat.focusBonus).toBe(0);

    const committed = lineupShapeOf(shapedTeam(74, ["combat", "presence"]));
    expect(committed.style).toBe("dive");
    expect(committed.commitment).toBeGreaterThan(10);
    expect(committed.focusBonus).toBeGreaterThan(0);
  });

  it("counts chemistry only where cards actually share a team", () => {
    expect(lineupShapeOf(team(74)).chemistry).toBe(0);
    const solo = team(74).map((card, index) => ({ ...card, team: `Org ${index}` }));
    expect(lineupShapeOf(solo).chemistry).toBe(0);
    const pair = team(74).map((card, index) => ({ ...card, team: index < 2 ? "One Org" : `Org ${index}` }));
    expect(lineupShapeOf(pair).chemistry).toBe(2);
    const whole = team(74).map((card) => ({ ...card, team: "One Org" }));
    expect(lineupShapeOf(whole).chemistry).toBe(5);
    expect(lineupShapeOf(whole).chemistryBonus).toBeGreaterThan(0);
    // Blank team names are not a team.
    const blanks = team(74).map((card) => ({ ...card, team: "   " }));
    expect(lineupShapeOf(blanks).chemistry).toBe(0);
  });

  it("keeps the three identities worth about the same", () => {
    const bonuses = (["damage", "laning"] as const, [
      lineupShapeOf(shapedTeam(74, ["damage", "laning"])),
      lineupShapeOf(shapedTeam(74, ["combat", "presence"])),
      lineupShapeOf(shapedTeam(74, ["survival", "vision"])),
    ]);
    // Each style owns a different NUMBER of beats, so per-beat bonuses
    // differ on purpose — but none may run away from the others.
    const values = bonuses.map((shape) => shape.focusBonus);
    expect(Math.max(...values) / Math.min(...values)).toBeLessThan(2.2);
  });

  it("makes a well-built five beat a scattered stronger one", () => {
    // The point of the whole mechanic. Each lineup faces ITS OWN bracket
    // — that's the mechanism: the bracket mostly follows your average, so
    // six points of raw overall buys less than a committed shape and a
    // roster who actually played together. Measured at round 5, the
    // built 74 wins ~64% of its matches against the scattered 80's ~55%.
    const built = shapedTeam(74, ["combat", "presence"], "One Org");
    const scattered = team(80);
    let builtWins = 0;
    let scatteredWins = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      const ownFoe = generateOpponent(74, 5, mulberry32(seed));
      const theirFoe = generateOpponent(80, 5, mulberry32(seed));
      if (simulateMatch(built, ownFoe.cards, bare(), mulberry32(seed * 7)).won) builtWins += 1;
      if (simulateMatch(scattered, theirFoe.cards, bare(), mulberry32(seed * 7)).won) scatteredWins += 1;
    }
    expect(builtWins).toBeGreaterThan(scatteredWins);
    // ...and raw overall still counts for something on its own.
    let flatStrong = 0;
    let flatWeak = 0;
    for (let seed = 0; seed < 400; seed += 1) {
      if (simulateMatch(team(84), generateOpponent(84, 5, mulberry32(seed)).cards, bare(), mulberry32(seed * 7)).won)
        flatStrong += 1;
      if (simulateMatch(team(66), generateOpponent(66, 5, mulberry32(seed)).cards, bare(), mulberry32(seed * 7)).won)
        flatWeak += 1;
    }
    expect(flatStrong).toBeGreaterThan(flatWeak);
  });
});

describe("crossroads catalog", () => {
  it("covers every momentum from 0 to 100 with exactly one situation", () => {
    for (let momentum = 0; momentum <= 100; momentum += 1) {
      const matches = CROSSROADS_CATALOG.filter(
        (situation) => momentum >= situation.band[0] && momentum <= situation.band[1],
      );
      expect(matches, `momentum ${momentum}`).toHaveLength(1);
      expect(situationFor(momentum).key).toBe(matches[0].key);
    }
  });

  it("gives every situation a safe floor, honest stakes, and a consequence", () => {
    for (const situation of CROSSROADS_CATALOG) {
      expect(situation.choices.length).toBeGreaterThanOrEqual(2);
      const safe = safeChoiceOf(situation);
      for (const choice of situation.choices) {
        expect(choice.lose).toBeLessThanOrEqual(safe.lose);
        // Every call has to SHAPE the second half, or it's just a number.
        expect(choice.consequence.note.length).toBeGreaterThan(10);
        if (choice.yourKeys.length === 0) {
          expect(choice.win).toBe(choice.lose);
          expect(choice.scoreBonus).toBe(0);
        } else {
          expect(choice.lose).toBeLessThan(0);
          expect(choice.win).toBeGreaterThan(0);
          expect(choice.scoreBonus).toBeGreaterThan(0);
          expect(choice.theirKeys.length).toBeGreaterThan(0);
          // A gamble that costs nothing when it misses is not a gamble.
          expect(choice.consequence.onFail, `${choice.key} has no downside`).toBeTruthy();
        }
      }
      expect(CROSSROADS_BY_KEY.get(situation.key)).toBe(situation);
    }
  });

  it("prices daring by risk, so the call you are best at is the cheap one", () => {
    // The rule that kills "just pick what I'm good at": a landed call pays
    // the catalog number at even odds, half at 75%, and up to double on a
    // long shot.
    expect(daringAt(100, 0.5)).toBe(100);
    expect(daringAt(100, 0.75)).toBe(50);
    expect(daringAt(100, 0.25)).toBe(150);
    expect(daringAt(100, 1)).toBe(0);
    for (let chance = 0; chance <= 1.001; chance += 0.05) {
      const next = daringAt(100, Math.min(1, chance + 0.05));
      expect(next).toBeLessThanOrEqual(daringAt(100, chance));
    }
  });

  it("reads odds off the engine's own noise band", () => {
    // A dead-even call is a coin flip; half the spread of edge is a lock.
    expect(winChanceOf(70, 70)).toBeCloseTo(0.5);
    expect(winChanceOf(70 + CROSSROADS_SPREAD / 2, 70)).toBe(1);
    expect(winChanceOf(70 - CROSSROADS_SPREAD / 2, 70)).toBe(0);
    expect(winChanceOf(75, 70)).toBeCloseTo(0.5 + 5 / CROSSROADS_SPREAD);
    // The COIN-FLIP patch widens the band, pulling every call toward even.
    const wide = crossroadsSpread({ noiseMult: 1.5 });
    expect(winChanceOf(80, 70, wide)).toBeLessThan(winChanceOf(80, 70, CROSSROADS_SPREAD));
  });

  it("previews the exact check, relics and enemy traits included", () => {
    const situation = CROSSROADS_BY_KEY.get("the_baron_question")!;
    const contest = situation.choices.find((choice) => choice.key === "contest")!;
    const ctx: MatchContext = { effects: { crossroadsBonus: 8 }, foe: { lateFlat: 5 }, arena: {} };
    const preview = previewCrossroadsChoice(contest, team(80), team(70), ctx);
    expect(preview).toEqual({ yourVal: 80 + contest.bonus + 8, theirVal: 75 });
    const press = CROSSROADS_BY_KEY.get("press_the_lead")!;
    expect(previewCrossroadsChoice(safeChoiceOf(press), team(80), team(70), bare())).toBeNull();
  });
});

describe("simulateMatch", () => {
  it("is deterministic for one seed", () => {
    const a = simulateMatch(team(75), team(72), bare(), mulberry32(7));
    const b = simulateMatch(team(75), team(72), bare(), mulberry32(7));
    expect(a).toEqual(b);
  });

  it("splits into halves that stitch back into the same match", () => {
    const whole = simulateMatch(team(75), team(72), bare(), mulberry32(9));
    const rand = mulberry32(9);
    const half = simulateFirstHalf(team(75), team(72), bare(), rand);
    const situation = CROSSROADS_BY_KEY.get(half.situationKey)!;
    const rest = simulateSecondHalf(half, safeChoiceOf(situation).key, team(75), team(72), bare(), rand);
    expect(rest).toEqual(whole);
    expect(half.situationKey).toBe(situationFor(half.momentum).key);
  });

  it("a stronger team wins far more often than it loses", () => {
    let wins = 0;
    for (let seed = 0; seed < 200; seed += 1) {
      if (simulateMatch(team(80), team(60), bare(), mulberry32(seed)).won) wins += 1;
    }
    expect(wins).toBeGreaterThan(180);
  });

  it("an even match stays near a coin flip", () => {
    // The lean that remains is the safe crossroads play's sure gain and
    // the pit-start edge going to whoever starts it. Past ~65% the sim
    // got rigged; under ~45% the mode stopped being winnable.
    let wins = 0;
    for (let seed = 0; seed < 300; seed += 1) {
      if (simulateMatch(team(72), team(72), bare(), mulberry32(seed)).won) wins += 1;
    }
    expect(wins).toBeGreaterThan(135);
    expect(wins).toBeLessThan(195);
  });

  it("narrates every phase, and every contest carries its margin", () => {
    const result = simulateMatch(team(75), team(70), bare(), mulberry32(3));
    const kinds = result.events.map((event) => event.kind);
    expect(kinds[0]).toBe("draft");
    expect(kinds).toContain("lanes");
    expect(kinds.filter((kind) => kind === "objective")).toHaveLength(3); // herald, dragon, soul
    expect(kinds.filter((kind) => kind === "fight")).toHaveLength(2);
    // The call, plus a second line when it bought (or cost) something.
    const calls = kinds.filter((kind) => kind === "crossroads");
    expect(calls.length).toBeGreaterThanOrEqual(1);
    expect(calls.length).toBeLessThanOrEqual(2);
    expect(kinds.filter((kind) => kind === "baron")).toHaveLength(1);
    // The siege always happens now — only its weight varies.
    expect(kinds.filter((kind) => kind === "hold")).toHaveLength(1);
    expect(kinds[kinds.length - 1]).toBe("nexus");
    expect(result.lanes).toHaveLength(5);

    for (const contest of result.contests) {
      // The margin IS the comparison — never decoration.
      expect(contest.margin).toBeCloseTo(contest.yourVal + contest.roll - contest.theirVal, 5);
      expect(contest.won).toBe(contest.margin >= 0);
    }
    expect(result.contests.filter((contest) => contest.kind === "lane")).toHaveLength(5);
  });

  it("keeps a gold line that starts even, moves with the beats, and ends where the sum says", () => {
    const result = simulateMatch(team(78), team(70), bare(), mulberry32(21));
    expect(result.goldSeries[0]).toEqual({ clock: 0, diff: 0 });
    for (let i = 1; i < result.goldSeries.length; i += 1) {
      expect(result.goldSeries[i].clock).toBeGreaterThanOrEqual(result.goldSeries[i - 1].clock);
    }
    const summed = result.contests.reduce((sum, contest) => sum + contest.goldSwing, 0);
    expect(result.gold).toBe(Math.round(summed));
    expect(result.goldSeries[result.goldSeries.length - 1].diff).toBe(result.gold);
  });

  it("scores every card, with damage shares that sum to 100", () => {
    const result = simulateMatch(team(75), team(72), bare(), mulberry32(4));
    expect(result.players).toHaveLength(5);
    expect(result.players.reduce((sum, player) => sum + player.damageShare, 0)).toBe(100);
    const fought = result.players.reduce((sum, player) => sum + player.kills + player.deaths, 0);
    expect(fought).toBeGreaterThan(0);
    expect(result.players.map((player) => player.role)).toEqual(GAUNTLET_ROLES);
    expect(result.mvp).toBeTruthy();
  });

  it("resolves the Baron as a damage race that reports how close it was", () => {
    let stolen = 0;
    let clean = 0;
    for (let seed = 0; seed < 120; seed += 1) {
      const result = simulateMatch(team(76), team(74), bare(), mulberry32(seed));
      const baron = result.baron;
      expect(baron.attempted).toBe(true);
      expect(baron.hpAtResolve).toBeGreaterThanOrEqual(0);
      expect(baron.hpAtResolve).toBeLessThanOrEqual(100);
      // Short-by is health left, in damage — zero exactly when it's taken.
      if (baron.taken) expect(baron.shortBy).toBe(0);
      else expect(baron.shortBy).toBe(Math.round(baron.hpAtResolve * 28));
      if (baron.stolen) stolen += 1;
      if (baron.taken && baron.hpAtResolve === 0) clean += 1;
    }
    expect(stolen).toBeGreaterThan(0);
    expect(clean).toBeGreaterThan(0);
  });

  it("hands the pit to the call's OUTCOME, not to the gamble itself", () => {
    // Calling the Baron and missing must give THEM the pit — otherwise
    // gambling is free and "always gamble" replaces "always play safe".
    const situation = CROSSROADS_BY_KEY.get("the_baron_question")!;
    const contest = situation.choices.find((choice) => choice.key === "contest")!;
    expect(contest.consequence.onWin?.pit).toBe("yours");
    expect(contest.consequence.onFail?.pit).toBe("theirs");

    let landedYours = 0;
    let missedTheirs = 0;
    for (let seed = 0; seed < 160; seed += 1) {
      const rand = mulberry32(seed);
      const half = simulateFirstHalf(team(74), team(74), bare(), rand);
      if (half.situationKey !== "the_baron_question") continue;
      const result = simulateSecondHalf(half, "contest", team(74), team(74), bare(), rand);
      const call = result.contests.find((entry) => entry.kind === "crossroads");
      if (!call) continue;
      if (call.won && result.baron.yours) landedYours += 1;
      if (!call.won && !result.baron.yours) missedTheirs += 1;
    }
    expect(landedYours).toBeGreaterThan(0);
    expect(missedTheirs).toBeGreaterThan(0);
  });

  it("carries the call's spoils into the beats that follow it", () => {
    // HUNT A PICK pays +8 to later fights when it lands and −4 when it
    // misses — the tape has to show the difference.
    const landedFightVals: number[] = [];
    const missedFightVals: number[] = [];
    for (let seed = 0; seed < 200; seed += 1) {
      const rand = mulberry32(seed);
      const half = simulateFirstHalf(team(74), team(74), bare(), rand);
      if (half.situationKey !== "the_baron_question") continue;
      const result = simulateSecondHalf(half, "hunt_a_pick", team(74), team(74), bare(), rand);
      const call = result.contests.find((entry) => entry.kind === "crossroads");
      const pit = result.contests.find((entry) => entry.key === "fight-27");
      if (!call || !pit) continue;
      (call.won ? landedFightVals : missedFightVals).push(pit.yourVal);
    }
    expect(landedFightVals.length).toBeGreaterThan(0);
    expect(missedFightVals.length).toBeGreaterThan(0);
    const mean = (values: number[]) => values.reduce((a, b) => a + b, 0) / values.length;
    expect(mean(landedFightVals)).toBeGreaterThan(mean(missedFightVals) + 6);
  });

  it("lets a gold lead pay for itself, bounded", () => {
    expect(goldEdge(0, {})).toBe(0);
    expect(goldEdge(2800, {})).toBeCloseTo(10);
    expect(goldEdge(99999, {})).toBe(14);
    expect(goldEdge(-99999, {})).toBe(-14);
    expect(goldEdge(2800, { goldEdgeMult: 2 })).toBeCloseTo(20);
  });

  it("moves outcomes the way relics, traits and conditions say", () => {
    const count = (ctxIn: MatchContext, kind: string) => {
      let won = 0;
      for (let seed = 0; seed < 100; seed += 1) {
        won += simulateMatch(team(70), team(70), ctxIn, mulberry32(seed)).contests.filter(
          (contest) => contest.kind === kind && contest.won,
        ).length;
      }
      return won;
    };
    // Your relic helps you.
    expect(count({ effects: { objectivesFlat: 25 }, foe: {}, arena: {} }, "objective")).toBeGreaterThan(
      count(bare(), "objective"),
    );
    // Their trait hurts you in the same currency.
    expect(count({ effects: {}, foe: { objectivesFlat: 25 }, arena: {} }, "objective")).toBeLessThan(
      count(bare(), "objective"),
    );
    // A condition bends both sides — the COIN-FLIP patch is the
    // underdog's round, and that has to be true in the numbers or the
    // scouting tip is a lie. A six-point gap wins 24 of 400 straight up
    // and 66 of 400 with the noise turned up.
    let plainUpsets = 0;
    let chaosUpsets = 0;
    const chaos: MatchContext = { effects: {}, foe: {}, arena: { noiseMult: 1.5 } };
    for (let seed = 0; seed < 400; seed += 1) {
      if (simulateMatch(team(72), team(78), bare(), mulberry32(seed)).won) plainUpsets += 1;
      if (simulateMatch(team(72), team(78), chaos, mulberry32(seed)).won) chaosUpsets += 1;
    }
    expect(chaosUpsets).toBeGreaterThan(plainUpsets * 1.5);
  });
});

describe("autopsy", () => {
  it("names the closest loss and what would have flipped it", () => {
    const result = simulateMatch(team(72), team(74), bare(), mulberry32(12));
    const autopsy = buildAutopsy(result, 2);
    expect(autopsy.verdict.length).toBeGreaterThan(5);
    expect(autopsy.stats.contestsTotal).toBe(result.contests.length);
    if (autopsy.closest) {
      const losses = result.contests.filter((contest) => !contest.won && contest.kind !== "lane");
      const tightest = Math.min(...losses.map((contest) => Math.abs(contest.margin)));
      expect(Math.abs(losses.find((c) => c.label === autopsy.closest!.label)!.margin)).toBeCloseTo(tightest, 5);
      expect(autopsy.closest.counter).toBeTruthy();
    }
  });

  it("points at the biggest gold swing of the match", () => {
    const result = simulateMatch(team(72), team(72), bare(), mulberry32(33));
    const autopsy = buildAutopsy(result, 3);
    const biggest = Math.max(...result.contests.map((contest) => Math.abs(contest.goldSwing)));
    expect(Math.abs(result.contests.find((c) => c.label === autopsy.swing!.label)!.goldSwing)).toBe(biggest);
  });

  it("reads a stomp as a win and a collapse as a loss, in words", () => {
    let win = null as ReturnType<typeof buildAutopsy> | null;
    let loss = null as ReturnType<typeof buildAutopsy> | null;
    for (let seed = 0; seed < 60 && (!win || !loss); seed += 1) {
      const strong = simulateMatch(team(85), team(60), bare(), mulberry32(seed));
      if (strong.won && !win) win = buildAutopsy(strong, 5);
      const weak = simulateMatch(team(58), team(85), bare(), mulberry32(seed));
      if (!weak.won && !loss) loss = buildAutopsy(weak, 0);
    }
    expect(win!.verdict.toLowerCase()).toContain("won");
    expect(loss!.verdict.length).toBeGreaterThan(5);
    expect(loss!.detail.length).toBeGreaterThan(10);
  });
});

describe("roundScore", () => {
  it("pays wins by round and margin, taxes trialists, and lets shine pay score only", () => {
    const lineup = team(70);
    const won = { won: true, momentum: 70, daring: 0 };
    expect(roundScore(1, { won: false, momentum: 40, daring: 0 }, lineup, {})).toBe(0);
    const early = roundScore(1, won, lineup, {});
    const late = roundScore(7, won, lineup, {});
    expect(late).toBeGreaterThan(early);

    const withTrialist = [...team(70).slice(0, 4), makeTrialist("Support")];
    expect(roundScore(1, won, withTrialist, {})).toBe(early - 40);

    const shinyLineup = team(70).map((card, index) => (index === 0 ? { ...card, foil: true } : card));
    expect(roundScore(1, won, shinyLineup, { styleScorePerShiny: 15 })).toBe(early + 15);
    expect(roundScore(1, won, lineup, { scoreFlat: 60 })).toBe(early + 60);
  });

  it("pays a landed call more the deeper the run got", () => {
    // Depth dominates a run's score (200 + 55/round), so an unscaled
    // daring bonus could never compete with simply surviving.
    expect(daringForRound(100, 1)).toBe(100);
    expect(daringForRound(100, 8)).toBe(226);
    const lineup = team(70);
    const quiet = roundScore(3, { won: true, momentum: 60, daring: 0 }, lineup, {});
    const bold = roundScore(3, { won: true, momentum: 60, daring: 90 }, lineup, {});
    expect(bold).toBe(quiet + daringForRound(90, 3));
    const later = roundScore(7, { won: true, momentum: 60, daring: 90 }, lineup, {});
    const laterQuiet = roundScore(7, { won: true, momentum: 60, daring: 0 }, lineup, {});
    expect(later - laterQuiet).toBeGreaterThan(bold - quiet);
  });
});

describe("relics", () => {
  it("aggregates multiplicatively and additively by kind", () => {
    const fx = aggregateEffects(["home_crowd", "lane_kingdom", "smite_tax", "blood_in_the_water", "cold_blood"]);
    expect(fx.snowballMult).toBeCloseTo(1.5);
    expect(fx.laneMomentumMult).toBeCloseTo(1.5 * 1.1);
    expect(fx.objectivesFlat).toBe(9);
    expect(fx.earlyFightBonus).toBe(8 + 3);

    const flats = aggregateEffects(["overtime", "glass_cannon", "shot_caller", "deep_wards", "the_promoter"]);
    expect(flats.fightFlat).toBe(6 + 8);
    expect(flats.lanesFlat).toBe(-2);
    expect(flats.holdFlat).toBe(-6 + 8);
    expect(flats.crossroadsBonus).toBe(8);
    expect(flats.scoreFlat).toBe(60);

    // Multiplier dials stack multiplicatively; flat dials add.
    const dials = aggregateEffects(["bounty_board", "deep_pockets", "high_roller", "the_playbook", "smoke_start"]);
    expect(dials.goldMult).toBeCloseTo(1.2);
    expect(dials.goldEdgeMult).toBeCloseTo(1.6);
    expect(dials.daringMult).toBeCloseTo(2.2 * 1.3);
    expect(dials.baronWindowFlat).toBe(7);
  });

  it("moves the fight the way each new dial says", () => {
    const goldOf = (keys: string[]) => {
      let total = 0;
      for (let seed = 0; seed < 60; seed += 1) {
        const ctx: MatchContext = { effects: aggregateEffects(keys), foe: {}, arena: {} };
        total += simulateMatch(team(76), team(72), ctx, mulberry32(seed)).gold;
      }
      return total;
    };
    // THE BOUNTY BOARD pays more for the same wins.
    expect(goldOf(["bounty_board"])).toBeGreaterThan(goldOf([]));

    // PIT TIMER burns the Baron faster, so less health survives to the smite.
    const hpOf = (keys: string[]) => {
      let total = 0;
      for (let seed = 0; seed < 80; seed += 1) {
        const ctx: MatchContext = { effects: aggregateEffects(keys), foe: {}, arena: {} };
        total += simulateMatch(team(76), team(72), ctx, mulberry32(seed)).baron.hpAtResolve;
      }
      return total;
    };
    expect(hpOf(["pit_timer"])).toBeLessThan(hpOf([]));

    // THE ANALYST is worthless on a scattered five and real on a committed
    // one — a conditional relic has to actually be conditional.
    const winsWith = (lineup: GauntletCard[], keys: string[]) => {
      let wins = 0;
      for (let seed = 0; seed < 250; seed += 1) {
        const ctx: MatchContext = { effects: aggregateEffects(keys), foe: {}, arena: {} };
        if (simulateMatch(lineup, team(77), ctx, mulberry32(seed)).won) wins += 1;
      }
      return wins;
    };
    const committed = shapedTeam(74, ["combat", "presence"]);
    expect(winsWith(committed, ["the_analyst"])).toBeGreaterThan(winsWith(committed, []));
    expect(winsWith(team(74), ["the_analyst"])).toBe(winsWith(team(74), []));
  });

  it("wakes comeback relics only when you are behind — including in the odds", () => {
    const situation = CROSSROADS_BY_KEY.get("the_baron_question")!;
    const contest = situation.choices.find((choice) => choice.key === "contest")!;
    const ctx: MatchContext = { effects: { comebackFlat: 9 }, foe: {}, arena: {} };
    const ahead = previewCrossroadsChoice(contest, team(74), team(74), ctx, 70)!;
    const behind = previewCrossroadsChoice(contest, team(74), team(74), ctx, 30)!;
    expect(behind.yourVal).toBe(ahead.yourVal + 9);
  });

  it("offers three unheld relics, seeded, without duplicates", () => {
    const offer = offerRelics(["home_crowd"], mulberry32(5));
    expect(offer).toHaveLength(3);
    expect(new Set(offer.map((relic) => relic.key)).size).toBe(3);
    expect(offer.map((relic) => relic.key)).not.toContain("home_crowd");
    expect(offerRelics(["home_crowd"], mulberry32(5)).map((r) => r.key)).toEqual(offer.map((r) => r.key));
  });

  it("gives every relic a rarity, and weights the offer by it", () => {
    for (const relic of RELIC_CATALOG) {
      expect(["common", "uncommon", "rare"], relic.key).toContain(relic.rarity);
      expect(relic.effect.length).toBeGreaterThan(10);
      expect(Object.keys(relic.effects).length).toBeGreaterThan(0);
    }
    // Every family and every rarity is actually populated.
    for (const family of ["ember", "void", "ice", "gold"] as const) {
      expect(RELIC_CATALOG.filter((relic) => relic.family === family).length).toBeGreaterThanOrEqual(5);
    }
    for (const rarity of ["common", "uncommon", "rare"] as const) {
      expect(RELIC_CATALOG.filter((relic) => relic.rarity === rarity).length).toBeGreaterThanOrEqual(4);
    }
  });

  it("shifts the odds toward rares as a run gets deep", () => {
    const early = rarityWeights(1);
    const late = rarityWeights(8);
    expect(late.rare).toBeGreaterThan(early.rare);
    expect(late.common).toBeLessThan(early.common);
    // Never inverted into absurdity.
    expect(late.common).toBeGreaterThan(0);
  });

  it("draws commons more often than rares, over many offers", () => {
    const seen: Record<string, number> = { common: 0, uncommon: 0, rare: 0 };
    for (let seed = 0; seed < 600; seed += 1) {
      for (const relic of offerRelics([], mulberry32(seed), 1)) seen[relic.rarity] += 1;
    }
    expect(seen.common).toBeGreaterThan(seen.uncommon);
    expect(seen.uncommon).toBeGreaterThan(seen.rare);
    expect(seen.rare).toBeGreaterThan(0);
  });

  it("keeps every catalog effect inside the sim's vocabulary", () => {
    const known = new Set([
      "laneMomentumMult", "objectivesFlat", "earlyFightBonus", "snowballMult",
      "freshLegsExtra", "styleScorePerShiny", "benchSwap",
      "fightFlat", "lanesFlat", "holdFlat", "crossroadsBonus", "scoreFlat",
      "goldMult", "goldEdgeMult", "daringMult", "baronBurnMult", "baronWindowFlat",
      "comebackFlat", "commitmentMult", "chemistryMult", "draftMult",
    ]);
    for (const relic of RELIC_CATALOG) {
      for (const key of Object.keys(relic.effects)) expect(known.has(key), `${relic.key}.${key}`).toBe(true);
    }
  });
});

describe("calibration — the run curve itself", () => {
  /** A player who reads the relic card: takes the best net stat on offer,
   *  discounting dials they haven't built for. The realistic ceiling. */
  function sensiblePick(offer: RelicDef[]): RelicDef {
    let best = offer[0];
    let score = -Infinity;
    for (const relic of offer) {
      const fx = relic.effects;
      const value =
        (fx.fightFlat ?? 0) +
        (fx.lanesFlat ?? 0) * 1.6 +
        (fx.holdFlat ?? 0) * 0.5 +
        (fx.objectivesFlat ?? 0) +
        (fx.crossroadsBonus ?? 0) * 0.4 +
        (fx.earlyFightBonus ?? 0) * 0.5 +
        ((fx.goldMult ?? 1) - 1) * 10 +
        ((fx.goldEdgeMult ?? 1) - 1) * 6 +
        ((fx.baronBurnMult ?? 1) - 1) * 8;
      if (value > score) {
        score = value;
        best = relic;
      }
    }
    return best;
  }

  function campaign(runs: number, pick: (offer: RelicDef[]) => RelicDef): { full: number; reachedFour: number } {
    let full = 0;
    let reachedFour = 0;
    for (let run = 0; run < runs; run += 1) {
      let alive = true;
      const held: string[] = [];
      for (let round = 1; round <= 8 && alive; round += 1) {
        const opponent = generateOpponent(74, round, mulberry32(run * 97 + round));
        const ctx: MatchContext = {
          effects: aggregateEffects(held),
          foe: aggregateTraits(opponent.traits ?? []),
          arena: conditionEffects(opponent.condition),
        };
        alive = simulateMatch(team(74), opponent.cards, ctx, mulberry32(run * 31 + round * 7)).won;
        if (alive) {
          if (round >= 4) reachedFour += 1;
          const offer = offerRelics(held, mulberry32(run * 53 + round * 11), round);
          if (offer.length > 0) held.push(pick(offer).key);
        }
      }
      if (alive) full += 1;
    }
    return { full, reachedFour };
  }

  it("keeps a blind run playable and a read run rewarded", () => {
    // The contract the whole mode balances against, as a BAND between two
    // players: one who takes whatever relic is offered first, and one who
    // reads the card. A 31-relic catalog with real tradeoffs is supposed
    // to reward knowing it — but never to lock out someone who doesn't.
    // Measured: blind ~1.0% clears with a third of runs reaching round 4;
    // sensible ~5.8%. Crossroads play and a committed lineup add on top.
    const blind = campaign(1000, (offer) => offer[0]);
    const read = campaign(1000, sensiblePick);

    // Reading the catalog has to matter...
    expect(read.full).toBeGreaterThan(blind.full * 2);
    // ...without becoming the only way to play: round 4 is where the
    // scraps live, and a blind run must still get there often.
    expect(blind.reachedFour).toBeGreaterThan(200);
    // And a full clear stays rare even when you know exactly what to take.
    expect(read.full).toBeLessThanOrEqual(110);
    expect(read.full).toBeGreaterThanOrEqual(25);
  });
});

describe("opponents", () => {
  it("ramps the bracket off the lineup and clamps the extremes", () => {
    expect(bracketTarget(70, 1)).toBeLessThan(70);
    expect(bracketTarget(70, 8)).toBeGreaterThan(70);
    expect(bracketTarget(70, 8)).toBeGreaterThan(bracketTarget(70, 4));
    expect(bracketTarget(99, 8)).toBeLessThanOrEqual(92);
    expect(bracketTarget(30, 1)).toBeGreaterThanOrEqual(45);
  });

  it("tracks your lineup SUB-linearly, so a better shelf is worth something", () => {
    // v3 tracked 1:1, which made a 65-average lineup and an 82-average
    // lineup measure identical curves. The bracket must rise by LESS than
    // the lineup does, or the collection is decorative.
    const weak = bracketTarget(64, 4);
    const strong = bracketTarget(84, 4);
    expect(strong - weak).toBeGreaterThan(0);
    expect(strong - weak).toBeLessThan(20);
    // The real property: a strong lineup's bracket sits STRICTLY between
    // "ignores your five" and "tracks it one for one".
    const atBaseline = bracketTarget(LEAGUE_BASELINE, 4);
    const oneForOne = atBaseline + (84 - LEAGUE_BASELINE);
    expect(bracketTarget(84, 4)).toBeGreaterThan(atBaseline);
    expect(bracketTarget(84, 4)).toBeLessThan(oneForOne);
  });

  it("generates a scoutable five: names, style, traits and a condition", () => {
    const opponent = generateOpponent(72, 4, mulberry32(11));
    expect(opponent.cards).toHaveLength(5);
    expect(new Set(opponent.cards.map((card) => card.name)).size).toBe(5);
    expect(new Set(opponent.cards.map((card) => card.role)).size).toBe(5);
    expect(Math.abs(opponent.avg - bracketTarget(72, 4))).toBeLessThanOrEqual(6);
    expect(compStyleOf(opponent.cards)).toBe(opponent.style);
    expect(opponent.label).toContain("COMP");
    expect(opponent.traits).toHaveLength(traitCountFor(4));
    expect(opponent.condition).toBeTruthy();
  });

  it("is deterministic per seed", () => {
    expect(generateOpponent(72, 4, mulberry32(11))).toEqual(generateOpponent(72, 4, mulberry32(11)));
  });
});
