import { describe, expect, it } from "vitest";
import {
  chooseGhosts,
  GHOST_RELIC_POTENCY,
  GHOST_TARGET_RELIEF,
  type GhostBrief,
  type GhostCandidate,
  ghostPlanOf,
  type GhostRun,
  ghostTraitEffects,
  normalizeGhost,
  teamMean,
} from "./ghosts";
import { bracketTarget, generateOpponent, ghostOpponent, weekSeed } from "./opponents";
import { aggregateEffects, offerRelics, RELIC_CATALOG, type RelicDef } from "./relics";
import { aggregateTraits, conditionEffects, mergeTraitEffects } from "./traits";
import {
  GAUNTLET_ROLES,
  type GauntletCard,
  type MatchContext,
  mulberry32,
  simulateMatch,
} from "./sim";

function card(name: string, role: (typeof GAUNTLET_ROLES)[number], overall: number, spike = 0): GauntletCard {
  return {
    inventoryId: 1,
    name,
    role,
    overall,
    stats: {
      combat: overall + spike, damage: overall + spike, economy: overall, laning: overall,
      vision: overall - spike, objectives: overall, turrets: overall, survival: overall - spike,
      presence: overall, impact: overall,
    },
    foil: true,
    signed: true,
    fresh: true,
  };
}

function team(avg: number): GauntletCard[] {
  return GAUNTLET_ROLES.map((role, index) => card(`P${index}`, role, avg));
}

/** A lineup with real internal shape — a fed carry and a weak support. */
function spiky(avg: number): GauntletCard[] {
  return [
    card("Top", "Top", avg - 4, 0),
    card("Jungle", "Jungle", avg + 1, 0),
    card("Mid", "Mid", avg + 9, 6),
    card("Bot", "Bot", avg + 3, 4),
    card("Support", "Support", avg - 9, -5),
  ];
}

describe("normalizing a ghost onto the bracket", () => {
  it("lands the team on the round's target", () => {
    // Real lineups do not follow a difficulty curve. If they were dropped
    // in raw, the bracket would be decided by whoever happened to be in
    // it — a deep collection posting an 85 in round 1, a thin shelf
    // reaching round 8 at 68.
    for (const raw of [62, 74, 88]) {
      for (const target of [55, 70, 84]) {
        const shifted = normalizeGhost(spiky(raw), target);
        expect(Math.round(teamMean(shifted))).toBe(target);
      }
    }
  });

  it("keeps every card's distance from its own team", () => {
    // The whole reason it SHIFTS rather than scales: multiplying would
    // squash a spiky lineup toward flat and stretch a flat one into
    // spikes, which is exactly the information worth keeping.
    const raw = spiky(80);
    const shifted = normalizeGhost(raw, 60);
    const rawMean = teamMean(raw);
    const newMean = teamMean(shifted);
    for (let index = 0; index < raw.length; index += 1) {
      expect(shifted[index].overall - newMean).toBeCloseTo(raw[index].overall - rawMean, 0);
    }
  });

  it("keeps the stat shape, so their weak lane is still weak", () => {
    const raw = spiky(80);
    const shifted = normalizeGhost(raw, 60);
    const rawSpread = (raw[2].stats.combat ?? 0) - (raw[2].stats.vision ?? 0);
    const newSpread = (shifted[2].stats.combat ?? 0) - (shifted[2].stats.vision ?? 0);
    expect(newSpread).toBeCloseTo(rawSpread, 0);
    // And the order of the five is untouched.
    const order = (cards: GauntletCard[]) =>
      [...cards].sort((a, b) => b.overall - a.overall).map((c) => c.name);
    expect(order(shifted)).toEqual(order(raw));
  });

  it("strips the cosmetics — a ghost is a memory, not a card", () => {
    // Nobody's foil is fighting for them, and Fresh Legs belongs to the
    // week it printed in. Cosmetics never touch a stat, on either side.
    for (const ghost of normalizeGhost(spiky(74), 70)) {
      expect(ghost.foil).toBe(false);
      expect(ghost.signed).toBe(false);
      expect(ghost.fresh).toBe(false);
      expect(ghost.inventoryId).toBeNull();
    }
  });

  it("never puts a card off the scale", () => {
    for (const ghost of normalizeGhost(spiky(95), 92)) {
      expect(ghost.overall).toBeLessThanOrEqual(95);
      for (const value of Object.values(ghost.stats)) expect(value).toBeLessThanOrEqual(99);
    }
    for (const ghost of normalizeGhost(spiky(50), 45)) {
      expect(ghost.overall).toBeGreaterThanOrEqual(40);
      for (const value of Object.values(ghost.stats)) expect(value).toBeGreaterThanOrEqual(20);
    }
  });

  it("survives an empty lineup", () => {
    expect(normalizeGhost([], 70)).toEqual([]);
  });
});

describe("a defender's build", () => {
  it("brings the dials that win games", () => {
    const brawler = RELIC_CATALOG.find((relic) => (relic.effects.fightFlat ?? 0) > 0)!;
    const effects = ghostTraitEffects([brawler.key], 1);
    expect(effects.fightFlat).toBeCloseTo(brawler.effects.fightFlat!, 6);
  });

  it("leaves behind the ones that only run a run", () => {
    // Score, style, Fresh Legs, the bench swap, what a landed call pays —
    // those are about running a run. A ghost is not running anything.
    const scorer = RELIC_CATALOG.find(
      (relic) => (relic.effects.scoreFlat ?? 0) > 0 && !relic.effects.fightFlat && !relic.effects.lanesFlat,
    );
    if (scorer) expect(ghostTraitEffects([scorer.key], 1)).toEqual({});
    const bench = RELIC_CATALOG.find((relic) => relic.effects.benchSwap);
    if (bench) expect(ghostTraitEffects([bench.key], 1).fightFlat).toBeUndefined();
  });

  it("scales by the potency dial, and by nothing else", () => {
    const keys = RELIC_CATALOG.slice(0, 6).map((relic) => relic.key);
    const full = ghostTraitEffects(keys, 1);
    const half = ghostTraitEffects(keys, 0.5);
    expect(half.fightFlat ?? 0).toBeCloseTo((full.fightFlat ?? 0) / 2, 6);
    expect(half.lanesFlat ?? 0).toBeCloseTo((full.lanesFlat ?? 0) / 2, 6);
  });

  it("compounds multipliers the way your own side does", () => {
    const golds = RELIC_CATALOG.filter((relic) => (relic.effects.goldMult ?? 1) > 1).slice(0, 2);
    if (golds.length < 2) return;
    const effects = ghostTraitEffects(golds.map((relic) => relic.key), 1);
    const expected = golds.reduce((product, relic) => product * (relic.effects.goldMult ?? 1), 1);
    expect(effects.goldMult).toBeCloseTo(expected, 6);
  });

  it("is nothing at all for a ghost with no relics", () => {
    expect(ghostTraitEffects([])).toEqual({});
    expect(ghostTraitEffects(["not_a_relic"])).toEqual({});
  });
});

describe("the plan a build states", () => {
  it("reads a fighting build as wanting the fight", () => {
    const fighters = RELIC_CATALOG.filter((relic) => (relic.effects.fightFlat ?? 0) > 0).slice(0, 2);
    expect(ghostPlanOf(fighters.map((relic) => relic.key))).toBe("brawl");
  });

  it("reads an objective build as playing the map", () => {
    const pit = RELIC_CATALOG.filter(
      (relic) => (relic.effects.objectivesFlat ?? 0) > 0 && !(relic.effects.fightFlat ?? 0),
    ).slice(0, 2);
    expect(ghostPlanOf(pit.map((relic) => relic.key))).toBe("objective");
  });

  it("says nothing about a build with nothing to say", () => {
    // Better no plan than an invented one — a rolled disposition on a
    // real player would be a lie about a real person's run.
    expect(ghostPlanOf([])).toBeUndefined();
  });
});

describe("choosing who stands where", () => {
  const runs = new Map<number, GhostRun>(
    [1, 2, 3].map((id) => [
      id,
      { id, discordId: `d${id}`, lineup: team(74), lineupAvg: 74, score: id * 1000 },
    ]),
  );
  const names = new Map([["d1", "Ana"], ["d2", "Ben"], ["d3", "Cass"]]);
  const candidates: GhostCandidate[] = [
    { id: 10, runId: 1, round: 1, relics: [], choiceKey: "hold" },
    { id: 11, runId: 2, round: 1, relics: ["a"], choiceKey: null },
    { id: 12, runId: 3, round: 1, relics: [], choiceKey: null },
    { id: 13, runId: 1, round: 2, relics: ["a"], choiceKey: "press" },
    { id: 14, runId: 2, round: 2, relics: [], choiceKey: null },
  ];

  it("never stands the same person in two rounds", () => {
    // Eight rounds against one player would be a strange week.
    const chosen = chooseGhosts(candidates, runs, names, () => 0, [1, 2]);
    expect(chosen.size).toBe(2);
    expect(chosen.get(1)!.runId).not.toBe(chosen.get(2)!.runId);
  });

  it("is the same bracket for everyone, from the same seed", () => {
    const a = chooseGhosts(candidates, runs, names, (round) => weekSeed("2026-08-24", round), [1, 2]);
    const b = chooseGhosts(candidates, runs, names, (round) => weekSeed("2026-08-24", round), [1, 2]);
    expect([...a.keys()]).toEqual([...b.keys()]);
    expect(a.get(1)!.runId).toBe(b.get(1)!.runId);
  });

  it("leaves a round empty rather than inventing a ghost for it", () => {
    // A round nobody reached last week has no ghost, and the caller
    // generates a team instead. This is what makes week one work.
    const chosen = chooseGhosts(candidates, runs, names, () => 0, [1, 2, 7, 8]);
    expect(chosen.has(7)).toBe(false);
    expect(chosen.has(8)).toBe(false);
  });

  it("skips a candidate whose run didn't survive", () => {
    const orphan: GhostCandidate[] = [{ id: 99, runId: 404, round: 1, relics: [], choiceKey: null }];
    expect(chooseGhosts(orphan, runs, names, () => 0, [1]).size).toBe(0);
  });

  it("names a nameless challenger rather than showing an id", () => {
    const chosen = chooseGhosts(candidates, runs, new Map(), () => 0, [1]);
    expect(chosen.get(1)!.name).toBe("A challenger");
  });

  it("carries the relics and the call from the round they were in", () => {
    const chosen = chooseGhosts(candidates, runs, names, () => 0, [1]);
    const pick = chosen.get(1)!;
    const source = candidates.find((row) => row.runId === pick.runId && row.round === 1)!;
    expect(pick.relics).toEqual(source.relics);
    expect(pick.choiceKey).toBe(source.choiceKey);
  });
});

describe("the ghost as an opponent", () => {
  const brief: GhostBrief = {
    runId: 5,
    name: "Ana",
    lineup: spiky(88),
    lineupAvg: 88,
    relics: RELIC_CATALOG.slice(0, 3).map((relic) => relic.key),
    choiceKey: "hold",
    round: 2,
    score: 4200,
  };

  it("prices an 88-average shelf at round 2's bracket, not at 88", () => {
    const opponent = ghostOpponent(brief, 74, 2, mulberry32(1));
    // The bracket target, less the relief a real opponent's shape, build
    // and call are worth (see the calibration below).
    expect(opponent.avg).toBe(bracketTarget(74, 2) - GHOST_TARGET_RELIEF);
    // And their real average is still on the card, because the scouting
    // screen should be honest about whose shelf this was.
    expect(opponent.ghost!.trueAvg).toBe(88);
  });

  it("keeps the round's condition and wall — those belong to the round", () => {
    const generated = generateOpponent(74, 4, mulberry32(weekSeed("2026-08-24", 4)));
    const ghosted = ghostOpponent(brief, 74, 4, mulberry32(weekSeed("2026-08-24", 4)));
    expect(ghosted.boss).toBe(generated.boss);
    expect(ghosted.condition).toBe(generated.condition);
  });

  it("wears the round's traits, same as an invented team would", () => {
    // Traits are most of a round's difficulty budget. The first cut left
    // ghosts bare — "their build is their trait" — and the bracket
    // measured a blind clear rate more than ten times what it ships with.
    const generated = generateOpponent(74, 6, mulberry32(weekSeed("2026-08-24", 6)));
    const ghosted = ghostOpponent(brief, 74, 6, mulberry32(weekSeed("2026-08-24", 6)));
    expect(ghosted.traits).toEqual(generated.traits);
    expect(ghosted.traits!.length).toBeGreaterThan(0);
  });

  it("puts the person on the scouting label", () => {
    expect(ghostOpponent(brief, 74, 3, mulberry32(3)).label).toContain("ANA");
  });
});

describe("calibration — a real opponent is not an unbeatable one", () => {
  /** A plausible ghost for a round: someone who got there, holding the
   *  relics a run that deep would have, having made a call. */
  function ghostFor(round: number, seed: number): GhostBrief {
    const held: string[] = [];
    for (let index = 1; index < round; index += 1) {
      const offer = offerRelics(held, mulberry32(seed * 53 + index * 11), index);
      if (offer.length > 0) held.push(offer[0].key);
    }
    return {
      runId: seed,
      name: "Ghost",
      // Ghost lineups vary the way real shelves do — the normalization is
      // exactly what has to make that not matter.
      lineup: spiky(64 + (seed % 24)),
      lineupAvg: 64 + (seed % 24),
      relics: held,
      // A real key, varied per ghost: their counter-call is a genuine
      // source of enemy strength and has to be inside the measurement.
      choiceKey: ["call_baron", "sit_on_it", "contest", "split_push", "turtle_up"][seed % 5],
      round,
      score: round * 800,
    };
  }

  function campaign(runs: number, pick: (offer: RelicDef[]) => RelicDef): { full: number; reachedFour: number } {
    let full = 0;
    let reachedFour = 0;
    for (let run = 0; run < runs; run += 1) {
      let alive = true;
      const held: string[] = [];
      for (let round = 1; round <= 8 && alive; round += 1) {
        const opponent = ghostOpponent(ghostFor(round, run * 7 + round), 74, round, mulberry32(run * 97 + round));
        const ctx: MatchContext = {
          effects: aggregateEffects(held),
          foe: mergeTraitEffects(aggregateTraits(opponent.traits ?? []), ghostTraitEffects(opponent.ghost!.relics)),
          arena: conditionEffects(opponent.condition),
          plan: opponent.plan,
          foeCall: opponent.ghost!.choiceKey ?? undefined,
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

  /** The control: the generated bracket, same lineup, same seeds, same
   *  relic picks. Comparing against a number written down last month
   *  would drift the moment anything in the sim moved; comparing against
   *  the AI arm measured in the same run cannot. */
  function aiCampaign(runs: number, pick: (offer: RelicDef[]) => RelicDef): { full: number; reachedFour: number } {
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
          plan: opponent.plan,
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

  it("clears at the same rate as the bracket it replaces", () => {
    // THE constraint on this whole feature: challenging, not impossible.
    //
    // A ghost brings three things an invented team does not — a real
    // lineup SHAPE (a fed lane and a weak one, never a flat block), a
    // build, and a decision at minute 20. Measured separately on this
    // harness, at 1,000 runs each:
    //
    //   flat five, no build, no call   115 clears   ← normalization alone
    //   their real shape                 86         ← shape is worth a lot
    //   + their call at minute 20        74
    //   + their build at full strength   21         ← far too much
    //
    // So two dials hold the ramp: GHOST_RELIC_POTENCY, because a defender
    // is not running a run and should not defend with a full attacking
    // build, and GHOST_TARGET_RELIEF, which prices a ghost's five slightly
    // lower exactly as a boss round prices its five higher. Solved, not
    // chosen — this test is where they were solved.
    const ghosts = campaign(1000, (offer) => offer[0]);
    const generated = aiCampaign(1000, (offer) => offer[0]);
    // Within a third of the bracket it replaces, in both directions. The
    // band is wide because the two brackets are genuinely different games
    // — it is there to catch "nobody can clear this", not to pin a number.
    expect(ghosts.full).toBeGreaterThan(generated.full * 0.66);
    expect(ghosts.full).toBeLessThan(generated.full * 1.5);
    // And the mid-run has to stay reachable, which is where the scraps
    // and most of the fun live.
    expect(ghosts.reachedFour).toBeGreaterThan(generated.reachedFour * 0.8);
  }, 120000);

  it("keeps a defender's build worth less than the attacker's", () => {
    // A ghost's relics defend at partial strength on purpose. At full
    // strength the run that got furthest last week would be the hardest
    // possible round 8 AND carry a full attacking build into a defensive
    // slot, which is two ramps stacked on one round.
    expect(GHOST_RELIC_POTENCY).toBeGreaterThan(0);
    expect(GHOST_RELIC_POTENCY).toBeLessThan(1);
  });
});
