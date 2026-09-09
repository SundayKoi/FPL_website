import { describe, expect, it } from "vitest";
import type { CardCopy } from "./config";
import { EXPEDITION_TIERS, isProtected, payoutRange, squadMeets, woundedUntil, ransomFor, TIER_ORDER } from "./config";
import {
  choiceAllowed,
  choiceSheet,
  consentLine,
  DEAD_NEEDS_PUSHES,
  FORKS,
  forkOptions,
  forkViews,
  forkWindows,
  openFork,
  rescueChance,
  resolveRoute,
  squadAbilities,
  type ForkChoice,
} from "./routes";

const copy = (over: Partial<Record<keyof CardCopy, unknown>> & { id: number }) =>
  ({
    tier: "gold",
    foil: false,
    foilType: null,
    signed: false,
    role: "Mid",
    playerName: `Card ${over.id}`,
    card: {},
    ...over,
  }) as unknown as CardCopy;

const squad = () => [copy({ id: 1 }), copy({ id: 2 }), copy({ id: 3 })];

/** A scripted stream: hands out the queue in order, then pins low. */
const script = (values: number[]) => {
  let i = 0;
  return () => (i < values.length ? values[i++] : 0);
};
const always = (value: number) => () => value;
const now = new Date("2026-09-04T12:00:00Z");

describe("the ladder", () => {
  it("has seven runs, in the order the board prints them", () => {
    expect(TIER_ORDER).toEqual(["scout", "gilded", "raid", "legend", "rescue", "exorcism", "legendary"]);
    for (const tier of TIER_ORDER) expect(FORKS[tier]).toHaveLength(EXPEDITION_TIERS[tier].forks);
  });
  it("only lets a card die on the Legendary route, and only after two pushes", () => {
    for (const tier of TIER_ORDER) {
      for (const fork of FORKS[tier]) {
        if (tier !== "legendary") expect(fork.pushRisk.dead).toBe(0);
      }
    }
    expect(FORKS.legendary.some((fork) => fork.pushRisk.dead > 0)).toBe(true);
    expect(DEAD_NEEDS_PUSHES).toBe(2);
  });
  it("keeps the Gilded Road a patron route behind three signatures, and pays for it", () => {
    expect(EXPEDITION_TIERS.gilded.patron).toBe(true);
    for (const tier of TIER_ORDER) if (tier !== "gilded") expect(EXPEDITION_TIERS[tier].patron).toBe(false);
    // The hardest gate on the board buys the biggest bag — never a card.
    expect(EXPEDITION_TIERS.gilded.minSigned).toBe(3);
    expect(EXPEDITION_TIERS.gilded.risk).toBe("wounded");
    expect(payoutRange("gilded")).toEqual({ min: 1000, max: 3000 });
    expect(payoutRange("gilded").max).toBeGreaterThan(payoutRange("legend").max);
    for (const fork of FORKS.gilded) {
      expect(fork.pushRisk.lost).toBe(0);
      expect(fork.pushRisk.dead).toBe(0);
      expect(fork.campRisk).toEqual({ wounded: 0, haunted: 0 });
    }
  });
  it("keeps the scouting run harmless", () => {
    expect(EXPEDITION_TIERS.scout.risk).toBe("none");
    expect(FORKS.scout[0].pushRisk).toEqual({ wounded: 0, lost: 0, dead: 0 });
    expect(FORKS.scout[0].gamble).not.toBeNull();
  });
});

describe("squadMeets — consent and the bench", () => {
  it("keeps one-of-ones off any route that can lose them", () => {
    const eclipse = copy({ id: 9, foil: true, foilType: "eclipse", signed: true, tier: "challenger" });
    expect(isProtected(eclipse)).toBe(true);
    const dribb = copy({ id: 77, card: { dribb: { number: 1, of: 5 } } });
    expect(isProtected(dribb)).toBe(true);
    expect(squadMeets("legend", [dribb, copy({ id: 2 }), copy({ id: 3 })]).reasons.join(" ")).toContain("one of five");
    const legend = squadMeets("legend", [eclipse, copy({ id: 2, foil: true, signed: true, tier: "challenger" }), copy({ id: 3, foil: true, tier: "challenger" })]);
    expect(legend.ok).toBe(false);
    expect(legend.reasons.join(" ")).toMatch(/Card 9 is one of one/);
    // A raid can only wound, so the same card is welcome.
    expect(squadMeets("raid", [eclipse, copy({ id: 2, foil: true, tier: "challenger" }), copy({ id: 3 })]).ok).toBe(true);
  });
  it("benches a wounded card when handed the clock, and not otherwise", () => {
    const hurt = copy({ id: 4, card: { wounded: { until: "2026-09-05T12:00:00Z", run: 1 } } });
    expect(woundedUntil(hurt, now)?.toISOString()).toBe("2026-09-05T12:00:00.000Z");
    expect(woundedUntil(hurt, new Date("2026-09-06T00:00:00Z"))).toBeNull();
    expect(squadMeets("scout", [hurt, copy({ id: 2 }), copy({ id: 3 })], now).reasons.join(" ")).toMatch(/wounded and benched/);
    expect(squadMeets("scout", [hurt, copy({ id: 2 }), copy({ id: 3 })]).ok).toBe(true);
  });
  it("prices a ransom off shine, above dust and below a jackpot", () => {
    expect(ransomFor(copy({ id: 1, tier: "bronze" }))).toBe(340);
    expect(ransomFor(copy({ id: 1, tier: "challenger", foil: true, foilType: "ice", signed: true }))).toBe(940);
  });
});

describe("fork windows", () => {
  const run = { startedAt: "2026-09-04T00:00:00Z", resolvesAt: "2026-09-05T00:00:00Z", forks: 2, choices: [] };
  it("splits a 24h raid into three legs with a fork at 8h and 16h", () => {
    const windows = forkWindows(run.startedAt, run.resolvesAt, 2);
    expect(windows.map((w) => w.opensAt.toISOString())).toEqual(["2026-09-04T08:00:00.000Z", "2026-09-04T16:00:00.000Z"]);
    expect(windows[1].closesAt.toISOString()).toBe("2026-09-05T00:00:00.000Z");
  });
  it("reports pending, open, decided and missed", () => {
    expect(forkViews(run, new Date("2026-09-04T01:00:00Z")).map((f) => f.status)).toEqual(["pending", "pending"]);
    expect(forkViews(run, new Date("2026-09-04T09:00:00Z")).map((f) => f.status)).toEqual(["open", "pending"]);
    expect(openFork(run, new Date("2026-09-04T09:00:00Z"))?.index).toBe(0);
    const later = forkViews(run, new Date("2026-09-04T17:00:00Z"));
    expect(later.map((f) => f.status)).toEqual(["missed", "open"]);
    expect(later[0].choice).toBe("camp");
    const decided = forkViews({ ...run, choices: [{ index: 1, choice: "push", at: "" }] }, new Date("2026-09-04T17:00:00Z"));
    expect(decided[1]).toMatchObject({ status: "decided", choice: "push" });
  });
  it("reads a choice sheet with silence as null", () => {
    expect(choiceSheet(3, [{ index: 1, choice: "light", at: "" }])).toEqual([null, "light", null]);
  });
});

describe("fork options", () => {
  it("unlocks favour, light and rally off the squad's own cards", () => {
    const plain = squadAbilities(squad());
    expect(plain).toEqual({ favour: false, light: false, rally: false });
    const team = [
      copy({ id: 1, signed: true, card: { teamName: "OMH" } }),
      copy({ id: 2, foil: true, card: { teamName: "omh " } }),
      copy({ id: 3, card: { teamName: "OMH" } }),
    ];
    expect(squadAbilities(team)).toEqual({ favour: true, light: true, rally: true });
  });
  it("locks what the squad cannot do, and says why", () => {
    const options = forkOptions("raid", 0, squad(), []);
    const locked = Object.fromEntries(options.map((o) => [o.choice, o.locked]));
    expect(locked.camp).toBeNull();
    expect(locked.push).toBeNull();
    expect(locked.favour).toMatch(/signed/);
    expect(locked.light).toMatch(/not dark/);
    expect(locked.rally).toMatch(/one roster/);
    expect(choiceAllowed("raid", 0, "favour", squad(), [])).toBe(false);
  });
  it("spends the favour once", () => {
    const team = [copy({ id: 1, signed: true }), copy({ id: 2 }), copy({ id: 3 })];
    expect(choiceAllowed("legend", 1, "favour", team, [])).toBe(true);
    expect(choiceAllowed("legend", 1, "favour", team, ["favour"])).toBe(false);
  });
  it("tells the truth about a warned fork", () => {
    const push = forkOptions("legend", 2, squad(), []).find((o) => o.choice === "push")!;
    expect(push.tease).toMatch(/Cursed/);
    expect(push.tease).toMatch(/15% one is lost/);
  });
});

function fates(result: ReturnType<typeof resolveRoute>) {
  return Object.fromEntries(result.fates.map((f) => [f.id, f.fate]));
}
function mutations(result: ReturnType<typeof resolveRoute>) {
  return Object.fromEntries(result.fates.map((f) => [f.id, f.mutation]));
}

describe("resolveRoute", () => {
  const base = { copies: squad(), insured: false, grade: "solid" as const, target: null, now };

  it("camps on silence and risks nothing on the ladder's kind forks", () => {
    const result = resolveRoute({ ...base, tier: "raid", choices: [null, null] }, always(0));
    expect(result.lootMultiplier).toBe(1);
    expect(result.pushes).toBe(0);
    expect(result.silences).toBe(2);
    expect(Object.values(fates(result))).toEqual(["home", "home", "home"]);
    expect(result.events.every((e) => e.tone === "neutral")).toBe(true);
  });

  it("scout: pushing is a coin flip on the bag and never a hazard", () => {
    const won = resolveRoute({ ...base, tier: "scout", choices: ["push"] }, always(0.99));
    expect(won.lootMultiplier).toBe(1.4);
    const lost = resolveRoute({ ...base, tier: "scout", choices: ["push"] }, always(0));
    expect(lost.lootMultiplier).toBe(0.7);
    expect(Object.values(fates(lost))).toEqual(["home", "home", "home"]);
  });

  it("raid: a push into the reactor can irradiate, a push at the ridge can wound", () => {
    // fork 0 push: victim pick (0.5 → card 2), wounded roll 0.99 (miss);
    // reward: bearer pick 0 → card 1, chance roll 0.1 (hit, < 0.2).
    // fork 1 push: victim pick 0.99 → card 3, wounded roll 0.1 (hit, < 0.3);
    // reward: bearer pick 0.5 → among unmutated [2,3] → card 3, chance 0.99 miss.
    const result = resolveRoute(
      { ...base, tier: "raid", choices: ["push", "push"] },
      script([0.5, 0.99, 0, 0.1, 0.99, 0.1, 0.5, 0.99]),
    );
    expect(result.lootMultiplier).toBe(1.5);
    expect(mutations(result)[1]).toBe("irradiated");
    expect(fates(result)[3]).toBe("wounded");
    expect(result.fates.find((f) => f.id === 3)?.woundedUntil).toBe("2026-09-07T12:00:00.000Z");
  });

  it("never stamps a second mutation on a copy", () => {
    const stamped = [copy({ id: 1, card: { mutation: { key: "hardened" } } }), copy({ id: 2 }), copy({ id: 3 })];
    // fork 0 push: victim (0.5 → 2), wounded miss; reward: pick among unmutated [2,3] → 0 → card 2, hit.
    const result = resolveRoute({ ...base, copies: stamped, tier: "raid", choices: ["push", null] }, script([0.5, 0.99, 0, 0.1]));
    expect(mutations(result)).toEqual({ 1: null, 2: "irradiated", 3: null });
  });

  it("legend: camping at the wrong checkpoint can haunt", () => {
    // fork 0 silence (kind fork, no rolls). fork 1 camp: wounded chance 0
    // (no roll), haunted roll 0.1 hit, victim pick 0 → card 1. fork 2 silence.
    const result = resolveRoute({ ...base, tier: "legend", choices: [null, "camp", null] }, script([0.1, 0]));
    expect(mutations(result)[1]).toBe("haunted");
    expect(result.events.some((e) => /brought something back/.test(e.text))).toBe(true);
  });

  it("legend: the warned vault curses a card that pushed and got hurt", () => {
    // fork 0 silent (kind). fork 1 silent: the wrong checkpoint's haunted
    // roll 0.99 misses. fork 2 push: victim 0 → card 1, wounded 0.1 (hit),
    // lost 0.99 (miss). Warned: the wound becomes a curse, the card is home.
    const result = resolveRoute({ ...base, tier: "legend", choices: [null, null, "push"] }, script([0.99, 0, 0.1, 0.99]));
    expect(fates(result)[1]).toBe("home");
    expect(mutations(result)[1]).toBe("cursed");
  });

  it("legend: a push at the vault can lose a card, and insurance carries it home", () => {
    // haunted miss, then victim 1, wounded miss, lost hit
    const bare = resolveRoute({ ...base, tier: "legend", choices: [null, null, "push"] }, script([0.99, 0, 0.99, 0.1]));
    expect(fates(bare)[1]).toBe("lost");
    expect(mutations(bare)[1]).toBe("cursed");
    const insured = resolveRoute({ ...base, tier: "legend", choices: [null, null, "push"], insured: true }, script([0.99, 0, 0.99, 0.1]));
    expect(fates(insured)[1]).toBe("wounded");
  });

  it("legend: a one-roster squad ignored twice is lost as one", () => {
    const team = [copy({ id: 1, card: { teamName: "OMH" } }), copy({ id: 2, card: { teamName: "OMH" } }), copy({ id: 3, card: { teamName: "OMH" } })];
    const result = resolveRoute({ ...base, copies: team, tier: "legend", choices: [null, null, "camp"] }, always(0.99));
    expect(Object.values(fates(result))).toEqual(["lost", "lost", "lost"]);
    // Two camps that were answered are not two silences.
    const answered = resolveRoute({ ...base, copies: team, tier: "legend", choices: ["camp", "camp", "camp"] }, always(0.99));
    expect(Object.values(fates(answered))).toEqual(["home", "home", "home"]);
  });

  it("favour pushes with no risk and light halves it", () => {
    const team = [copy({ id: 1, signed: true, foil: true }), copy({ id: 2 }), copy({ id: 3 })];
    // favour: no victim pick, no risk rolls; reward pick 0 → 1, chance 0.1 hit.
    const favour = resolveRoute({ ...base, copies: team, tier: "raid", choices: ["favour", null] }, script([0, 0.1]));
    expect(favour.lootMultiplier).toBe(1.25);
    expect(Object.values(fates(favour))).toEqual(["home", "home", "home"]);
    expect(mutations(favour)[1]).toBe("irradiated");
    // light at the dark ridge: wounded chance 0.15 instead of 0.3 — a 0.2
    // roll misses where it would have hit.
    const light = resolveRoute({ ...base, copies: team, tier: "raid", choices: [null, "light"] }, script([0, 0.2, 0.99, 0.99]));
    expect(Object.values(fates(light))).toEqual(["home", "home", "home"]);
    const push = resolveRoute({ ...base, copies: team, tier: "raid", choices: [null, "push"] }, script([0, 0.2, 0.99, 0.99]));
    expect(fates(push)[1]).toBe("wounded");
  });

  it("rally doubles the loot and the wipe rule does not fire on answers", () => {
    const team = [copy({ id: 1, card: { teamName: "A" } }), copy({ id: 2, card: { teamName: "A" } }), copy({ id: 3, card: { teamName: "A" } })];
    const result = resolveRoute({ ...base, copies: team, tier: "raid", choices: ["rally", "rally"] }, always(0.99));
    expect(result.lootMultiplier).toBe(2);
    expect(Object.values(fates(result))).toEqual(["home", "home", "home"]);
  });

  it("legendary: nobody dies before the second push, and the survivors come home Voidtouched", () => {
    // fork 0 push: victim 0 → 1; wounded 0.99 miss, lost 0.99 miss; dead not
    // rolled (pushes 1 < 2); reward pick 0 → 1, chance 0.99 miss.
    // fork 1 push: victim 0.5 → 2; wounded miss, lost miss, dead 0.1 HIT.
    // forks 2,3 silent: camp wounded 0.15/0.1 → rolls 0.99 miss ×2.
    // finale: first voidtouched pick 0 → card 1; second chance 0.99 miss.
    const result = resolveRoute(
      { ...base, tier: "legendary", choices: ["push", "push", null, null] },
      script([0, 0.99, 0.99, 0, 0.99, 0.5, 0.99, 0.99, 0.1, 0.99, 0.99, 0, 0.99]),
    );
    expect(fates(result)[2]).toBe("dead");
    expect(mutations(result)[2]).toBeNull();
    expect(mutations(result)[1]).toBe("voidtouched");
    expect(result.pushes).toBe(2);
  });

  it("legendary: insurance turns a death into a loss", () => {
    const result = resolveRoute(
      { ...base, tier: "legendary", choices: ["push", "push", null, null], insured: true },
      script([0, 0.99, 0.99, 0, 0.99, 0.5, 0.99, 0.99, 0.1, 0.99, 0.99, 0, 0.99]),
    );
    expect(fates(result)[2]).toBe("lost");
  });

  it("legendary: a one-of-one that slipped through is capped at wounded", () => {
    const team = [copy({ id: 1, foil: true, foilType: "eclipse" }), copy({ id: 2 }), copy({ id: 3 })];
    const result = resolveRoute(
      { ...base, copies: team, tier: "legendary", choices: ["push", "push", null, null] },
      script([0, 0.99, 0.99, 0, 0.99, 0, 0.99, 0.99, 0.1, 0.99, 0.99, 0.5, 0.99]),
    );
    expect(fates(result)[1]).toBe("wounded");
  });

  it("rescue: shine decides, a push helps, and failure hurts the rescuers", () => {
    expect(rescueChance(squad(), false)).toBeCloseTo(0.45 + 0.015 * 9, 5);
    expect(rescueChance(squad(), true)).toBeCloseTo(0.45 + 0.015 * 9 + 0.15, 5);
    expect(rescueChance([copy({ id: 1, tier: "challenger", foil: true, foilType: "ice", signed: true }), copy({ id: 2, tier: "challenger", foil: true, foilType: "ice", signed: true }), copy({ id: 3, tier: "challenger" })], true)).toBe(0.9);
    // camp: wounded 0.15 → 0.99 miss; rescue roll 0.99 → fail; three
    // wound rolls 0.1 hit, 0.99 miss, 0.1 hit; lost-a-rescuer 0.05 hit, pick 0.99 → card 3.
    const failed = resolveRoute({ ...base, tier: "rescue", choices: [null], target: 77 }, script([0.99, 0.99, 0.1, 0.99, 0.1, 0.05, 0.99]));
    expect(failed.rescued).toBe(false);
    expect(fates(failed)).toEqual({ 1: "wounded", 2: "home", 3: "lost" });
    const saved = resolveRoute({ ...base, tier: "rescue", choices: ["push"], target: 77 }, script([0, 0.99, 0.1]));
    expect(saved.rescued).toBe(true);
    expect(Object.values(fates(saved))).toEqual(["home", "home", "home"]);
  });

  it("exorcism: no forks, no rolls, the target comes home clean", () => {
    let draws = 0;
    const result = resolveRoute({ ...base, tier: "exorcism", choices: [], target: 2 }, () => { draws += 1; return 0; });
    expect(draws).toBe(0);
    expect(result.cleansed).toBe(2);
    expect(result.lootMultiplier).toBe(1);
  });

  it("drops a fragment on a legend jackpot every time, and sometimes on solid", () => {
    expect(resolveRoute({ ...base, tier: "legend", choices: [null, null, null], grade: "jackpot" }, always(0.99)).fragments).toBe(1);
    expect(resolveRoute({ ...base, tier: "legend", choices: [null, null, null], grade: "solid" }, always(0.99)).fragments).toBe(0);
    expect(resolveRoute({ ...base, tier: "legend", choices: [null, null, null], grade: "solid" }, always(0.1)).fragments).toBe(1);
    expect(resolveRoute({ ...base, tier: "scout", choices: [null], grade: "jackpot" }, always(0.1)).fragments).toBe(0);
  });

  it("a Cursed card sent out again can be lost, but only where the route can lose it", () => {
    const cursed = [copy({ id: 1, card: { mutation: { key: "cursed" } } }), copy({ id: 2 }), copy({ id: 3 })];
    // legend, all silent: fork 1's haunted roll 0.99 misses; the curse roll 0.1 hits.
    const gone = resolveRoute({ ...base, copies: cursed, tier: "legend", choices: [null, null, null] }, script([0.99, 0.1]));
    expect(fates(gone)[1]).toBe("lost");
    const raid = resolveRoute({ ...base, copies: cursed, tier: "raid", choices: [null, null] }, always(0));
    expect(fates(raid)[1]).toBe("home");
  });

  it("walks no forks for a run launched before forks existed", () => {
    let draws = 0;
    const result = resolveRoute({ ...base, tier: "legendary", forks: 0, choices: [] }, () => { draws += 1; return 0; });
    // No forks, but the finale still runs: the first Voidtouched pick.
    expect(result.pushes).toBe(0);
    expect(result.silences).toBe(0);
    expect(draws).toBeGreaterThanOrEqual(1);
    expect(resolveRoute({ ...base, tier: "raid", forks: 0, choices: [] }, always(0)).silences).toBe(0);
  });

  it("caps the loot multiplier", () => {
    const team = [copy({ id: 1, card: { teamName: "A" } }), copy({ id: 2, card: { teamName: "A" } }), copy({ id: 3, card: { teamName: "A" } })];
    const choices: ForkChoice[] = ["rally", "rally", "rally", "rally"];
    const result = resolveRoute({ ...base, copies: team, tier: "legendary", choices }, always(0.99));
    expect(result.lootMultiplier).toBe(2.5);
  });
});

describe("consentLine", () => {
  it("names the cards and the worst that can happen", () => {
    expect(consentLine("scout", squad(), false)).toMatch(/Nothing on this run can hurt/);
    expect(consentLine("raid", squad(), false)).toMatch(/Card 1, Card 2, Card 3 can come home wounded/);
    expect(consentLine("legend", squad(), false)).toMatch(/can be lost here/);
    expect(consentLine("legend", squad(), true)).toMatch(/wounded/);
    expect(consentLine("legendary", squad(), false)).toMatch(/can DIE/);
    expect(consentLine("legendary", squad(), true)).toMatch(/can be lost/);
  });
});

// === the road ================================================================

import type { ExpeditionTierKey } from "./config";
import { CACHE_LOOT, FRAGMENT_CAP, HOLD_LOOT, RIVAL_LOSS_LOOT, RIVAL_WIN_LOOT, ROAD_RULES, ROADS, ROLE_CALLS, TOLL_LOOT, forksFor, isCampChoice } from "./routes";

const road = (runId: number, over: Partial<{ rules: number; convoy: number | null; forks: number }> = {}) => ({ runId, rules: ROAD_RULES, convoy: null, ...over });

/**
 * A road under the road rules whose places are the FIXED forks, except
 * that slot `index` (when given) is the named place. Found by searching
 * run ids, so a scripted rand queue below reads exactly as it would have
 * on the fixed road: the other places draw nothing extra.
 */
const roadWith = (tier: ExpeditionTierKey, index: number | null = null, key: string | null = null) => {
  for (let id = 1; id < 20000; id += 1) {
    const drawn = forksFor(tier, road(id));
    if (drawn.every((fork, slot) => (slot === index ? fork.key === key : fork.key === FORKS[tier][slot].key))) return road(id);
  }
  throw new Error(`no run draws ${key ?? "the fixed road"} on ${tier}`);
};

describe("the road", () => {
  it("keeps the fixed forks as the first place in every slot, so FORKS is what it always was", () => {
    for (const tier of TIER_ORDER) {
      expect(FORKS[tier]).toEqual(ROADS[tier].map((slot) => slot[0]));
      expect(ROADS[tier]).toHaveLength(EXPEDITION_TIERS[tier].forks);
      // Every slot has somewhere else to be, on every route with a fork.
      for (const slot of ROADS[tier]) expect(slot.length).toBeGreaterThanOrEqual(2);
    }
    expect(FORKS.raid[0].key).toBe("reactor");
    expect(FORKS.legendary[1].key).toBe("singing");
  });

  it("holds every place in a slot to its slot's risk envelope", () => {
    // The balance is per slot: whichever ridge a run draws, a push there
    // is the same coin. Death stays Legendary-only and lost stays off the
    // routes that cannot lose a card, on every alternative.
    for (const tier of TIER_ORDER) {
      for (const slot of ROADS[tier]) {
        const risk = EXPEDITION_TIERS[tier].risk;
        for (const fork of slot) {
          expect(fork.pushRisk.dead > 0).toBe(tier === "legendary" && fork.pushRisk.dead > 0);
          if (risk === "none") expect(fork.pushRisk).toEqual({ wounded: 0, lost: 0, dead: 0 });
          if (risk === "wounded") expect(fork.pushRisk.lost + fork.pushRisk.dead).toBe(0);
          if (tier !== "legendary") expect(fork.pushRisk.dead).toBe(0);
          // The Legendary route never drops a fragment, on any of its places.
          if (tier === "legendary") expect(fork.pushFind?.fragment ?? 0).toBe(0);
          expect(fork.key).toMatch(/^[a-z]+$/);
        }
        const keys = new Set(slot.map((fork) => fork.key));
        expect(keys.size).toBe(slot.length);
      }
    }
  });

  it("draws a road per run, the same road every time, and a different one for a different run", () => {
    const first = forksFor("legend", road(101));
    expect(first).toHaveLength(3);
    expect(forksFor("legend", road(101))).toEqual(first);
    // Across many runs every place in every slot turns up.
    const seen = new Set(Array.from({ length: 200 }, (_, id) => forksFor("legend", road(id + 1)).map((fork) => fork.key).join(">")));
    expect(seen.size).toBeGreaterThan(10);
    const perSlot = ROADS.legend.map((_, index) => new Set(Array.from({ length: 200 }, (_, id) => forksFor("legend", road(id + 1))[index].key)));
    perSlot.forEach((keys, index) => expect(keys.size).toBe(ROADS.legend[index].length));
  });

  it("walks the fixed road for a run stamped before the road, and for no road at all", () => {
    expect(forksFor("raid", road(7, { rules: 2 }))).toEqual(FORKS.raid);
    expect(forksFor("raid", null)).toEqual(FORKS.raid);
    expect(forksFor("raid")).toEqual(FORKS.raid);
    // A run from before forks existed walks none.
    expect(forksFor("legendary", road(7, { forks: 0 }))).toEqual([]);
  });

  it("draws one road for a convoy, whichever run asks", () => {
    const host = forksFor("raid", road(11, { convoy: 3 }));
    const guest = forksFor("raid", road(12, { convoy: 3 }));
    expect(guest).toEqual(host);
    // And a convoy's road is its own, not run 3's.
    const roads = Array.from({ length: 40 }, (_, id) => forksFor("legendary", road(id + 1, { convoy: id + 1 })).map((f) => f.key).join(">"));
    expect(new Set(roads).size).toBeGreaterThan(5);
  });
});

describe("role calls", () => {
  const roles = () => [
    copy({ id: 1, role: "Top" }),
    copy({ id: 2, role: "Jungle" }),
    copy({ id: 3, role: "Support" }),
  ];
  const base = { copies: roles(), insured: false, grade: "solid" as const, target: null, now };

  it("names five calls, one per role the league prints, and only under the road", () => {
    expect(ROLE_CALLS.map((call) => [call.choice, call.role])).toEqual([
      ["hold", "Top"], ["scout", "Jungle"], ["roam", "Mid"], ["kite", "Bot"], ["ward", "Support"],
    ]);
    // No road: the five words are not offered at all.
    expect(forkOptions("raid", 0, roles(), []).map((o) => o.choice)).toEqual(["camp", "push", "favour", "light", "rally"]);
    // On a road: offered, and locked to the roles the squad has.
    const options = forkOptions("raid", 0, roles(), [], road(5));
    const locked = Object.fromEntries(options.map((o) => [o.choice, o.locked]));
    expect(locked.hold).toBeNull();
    expect(locked.scout).toBeNull();
    expect(locked.ward).toBeNull();
    expect(locked.roam).toMatch(/Needs a Mid/);
    expect(locked.kite).toMatch(/Needs a Bot/);
    expect(options.find((o) => o.choice === "hold")?.role).toBe("Top");
  });

  it("spends each call once, and refuses them all at the scouting run's coin flip", () => {
    expect(choiceAllowed("legend", 1, "hold", roles(), ["hold"], road(5))).toBe(false);
    expect(choiceAllowed("legend", 1, "hold", roles(), ["scout"], road(5))).toBe(true);
    expect(choiceAllowed("scout", 0, "hold", roles(), [], road(5))).toBe(false);
    expect(forkOptions("scout", 0, roles(), [], road(5)).find((o) => o.choice === "kite")?.locked).toMatch(/coin flip/);
    // And never without the road, whatever the squad.
    expect(choiceAllowed("legend", 1, "hold", roles(), [], road(5, { rules: 2 }))).toBe(false);
  });

  it("hold: a camp that nothing happens to, and a little more in the bag", () => {
    // The Legend Hunt's fixed second fork haunts a camper at 15%. A hold
    // there draws nothing — the 0.1 that would haunt a camp is never read.
    const held = resolveRoute({ ...base, tier: "legend", forks: 3, road: roadWith("legend"), choices: [null, "hold", null] }, always(0.1));
    expect(Object.values(mutations(held))).toEqual([null, null, null]);
    expect(held.lootMultiplier).toBe(1 + HOLD_LOOT);
    expect(held.pushes).toBe(0);
    expect(held.events.some((e) => /held the checkpoint/.test(e.text))).toBe(true);
    // The same sheet on a legacy run reads hold as camp, and IS haunted.
    const legacy = resolveRoute({ ...base, tier: "legend", choices: [null, "hold", null] }, script([0.1, 0]));
    expect(mutations(legacy)[1]).toBe("haunted");
    expect(isCampChoice("hold")).toBe(true);
    expect(isCampChoice("kite")).toBe(false);
  });

  it("scout: the harm lands on the Jungle, at three-quarter risk", () => {
    // Raid fork 1 (the brutal fork, wounded 0.3): a scout rolls 0.225. One
    // Jungle → no victim draw. Roll 0.25: a push would wound, a scout does
    // not. Reward: bearer pick 0, chance 0.99 miss.
    const scouted = resolveRoute({ ...base, tier: "raid", forks: 2, road: roadWith("raid"), choices: [null, "scout"] }, script([0.25, 0, 0.99]));
    expect(Object.values(fates(scouted))).toEqual(["home", "home", "home"]);
    expect(scouted.pushes).toBe(1);
    // Roll 0.1 wounds — and it is the Jungle (card 2), not a random card.
    const hurt = resolveRoute({ ...base, tier: "raid", forks: 2, road: roadWith("raid"), choices: [null, "scout"] }, script([0.1, 0, 0.99]));
    expect(fates(hurt)[2]).toBe("wounded");
    expect(fates(hurt)[1]).toBe("home");
  });

  it("roam: half again the loot, and the harm rolled on two cards", () => {
    const mids = [copy({ id: 1, role: "Mid" }), copy({ id: 2, role: "Mid" }), copy({ id: 3, role: "Bot" })];
    // Raid fork 1: victim pick 0 → card 1, second pick 0.99 → card 3 (from
    // [2,3]); card 1 wounded 0.1 hit; card 3 wounded 0.1 hit; reward pick
    // 0.5, chance 0.99 miss.
    const result = resolveRoute({ ...base, copies: mids, tier: "raid", forks: 2, road: roadWith("raid"), choices: [null, "roam"] }, script([0, 0.99, 0.1, 0.1, 0.5, 0.99]));
    // 1 + 0.25 × 1.5 = 1.375, and the multiplier is kept to two places.
    expect(result.lootMultiplier).toBe(1.38);
    expect(fates(result)).toEqual({ 1: "wounded", 2: "home", 3: "wounded" });
  });

  it("kite: half the loot at a quarter of the risk", () => {
    const bots = [copy({ id: 1, role: "Bot" }), copy({ id: 2 }), copy({ id: 3 })];
    // Wounded 0.3 × 0.25 = 0.075: a 0.1 roll misses where a push hits.
    const kited = resolveRoute({ ...base, copies: bots, tier: "raid", forks: 2, road: roadWith("raid"), choices: [null, "kite"] }, script([0, 0.1, 0, 0.99]));
    expect(Object.values(fates(kited))).toEqual(["home", "home", "home"]);
    expect(kited.lootMultiplier).toBe(1.13);
    const pushed = resolveRoute({ ...base, copies: bots, tier: "raid", forks: 2, road: roadWith("raid"), choices: [null, "push"] }, script([0, 0.1, 0, 0.99]));
    expect(fates(pushed)[1]).toBe("wounded");
  });

  it("ward: the wound roll stands, the lost and dead rolls are halved", () => {
    const supports = [copy({ id: 1, role: "Support" }), copy({ id: 2 }), copy({ id: 3 })];
    // The vault (wounded 0.3, lost 0.15, warned): victim 0 → card 1;
    // wounded 0.99 miss; lost 0.1 — a push loses the card, a ward (0.075)
    // does not.
    const warded = resolveRoute({ ...base, copies: supports, tier: "legend", forks: 3, road: roadWith("legend"), choices: [null, null, "ward"] }, script([0.99, 0, 0.99, 0.1]));
    expect(fates(warded)[1]).toBe("home");
    const pushed = resolveRoute({ ...base, copies: supports, tier: "legend", forks: 3, road: roadWith("legend"), choices: [null, null, "push"] }, script([0.99, 0, 0.99, 0.1]));
    expect(fates(pushed)[1]).toBe("lost");
  });

  it("reads a call the squad cannot make as a camp, the way it reads a favour with no ink", () => {
    // No Mid in the squad: a recorded roam is a camp. Fork 0 of the raid
    // is kind, so nothing is drawn and nothing is pushed.
    const result = resolveRoute({ ...base, tier: "raid", forks: 2, road: roadWith("raid"), choices: ["roam", null] }, always(0));
    expect(result.pushes).toBe(0);
    expect(result.lootMultiplier).toBe(1);
  });
});

describe("what the road adds to a fork", () => {
  // Poor: a solid or jackpot Legend Hunt would draw the finale's own
  // fragment off the pinned tail of the queue and muddy the count.
  const base = { copies: squad(), insured: false, grade: "poor" as const, target: null, now };

  it("a push can find a fragment or a pack, after the harm and the reward", () => {
    // The throne room (legend slot 2): warned, wounded 0.3, lost 0.15,
    // fragment 0.25. Victim 0 → card 1, wounded 0.99 miss, lost 0.99 miss,
    // no reward; fragment roll 0.1 hit.
    const throne = roadWith("legend", 2, "throne");
    const result = resolveRoute({ ...base, tier: "legend", forks: 3, road: throne, choices: [null, null, "push"] }, script([0.99, 0, 0.99, 0.99, 0.1]));
    expect(result.fragments).toBe(1);
    expect(result.events.some((e) => /fragment of a map/.test(e.text) && e.fork === 2)).toBe(true);
    // The sleeper carries a pack instead.
    const sleeper = roadWith("legend", 2, "sleeper");
    const pack = resolveRoute({ ...base, tier: "legend", forks: 3, road: sleeper, choices: [null, null, "push"] }, script([0.99, 0, 0.99, 0.99, 0.1]));
    expect(pack.comp).toBe(true);
    expect(pack.fragments).toBe(0);
  });

  it("a toll fork charges the careful, and says so", () => {
    // The barricade (raid slot 1): camping pays a share half the time.
    const barricade = roadWith("raid", 1, "barricade");
    const paid = resolveRoute({ ...base, tier: "raid", forks: 2, road: barricade, choices: [null, "camp"] }, always(0.1));
    expect(paid.lootMultiplier).toBe(1 - TOLL_LOOT);
    expect(paid.events.some((e) => /had a price/.test(e.text))).toBe(true);
    const free = resolveRoute({ ...base, tier: "raid", forks: 2, road: barricade, choices: [null, "camp"] }, always(0.9));
    expect(free.lootMultiplier).toBe(1);
    // A Top's hold pays no toll.
    const tops = [copy({ id: 1, role: "Top" }), copy({ id: 2 }), copy({ id: 3 })];
    const held = resolveRoute({ ...base, copies: tops, tier: "raid", forks: 2, road: barricade, choices: [null, "hold"] }, always(0.1));
    expect(held.lootMultiplier).toBe(1 + HOLD_LOOT);
  });

  it("a camp can bring home a mutation where the place says so", () => {
    // The bell tower (legend slot 1): haunted 0.2 on a camp, hardened 0.1
    // for waiting it out. Haunted 0.99 miss; reward pick 0 → card 1, 0.05 hit.
    const bell = roadWith("legend", 1, "belltower");
    const result = resolveRoute({ ...base, tier: "legend", forks: 3, road: bell, choices: [null, "camp", null] }, script([0.99, 0, 0.05]));
    expect(mutations(result)[1]).toBe("hardened");
  });

  it("applies the trail's beats: a cache, a rival either way, a hunter's fragment, a shrine on the next fork", () => {
    const quiet = { ...base, tier: "raid" as const, forks: 2, road: roadWith("raid"), choices: [null, null] as (ForkChoice | null)[] };
    expect(resolveRoute({ ...quiet, encounters: [{ leg: 0, key: "cache" }] }, always(0)).lootMultiplier).toBe(1 + CACHE_LOOT);
    expect(resolveRoute({ ...quiet, encounters: [{ leg: 0, key: "rival", won: true }] }, always(0)).lootMultiplier).toBe(1 + RIVAL_WIN_LOOT);
    expect(resolveRoute({ ...quiet, encounters: [{ leg: 0, key: "rival", won: false }] }, always(0)).lootMultiplier).toBe(1 - RIVAL_LOSS_LOOT);
    expect(resolveRoute({ ...quiet, encounters: [{ leg: 1, key: "hunter", found: true }] }, always(0)).fragments).toBe(1);
    expect(resolveRoute({ ...quiet, encounters: [{ leg: 1, key: "hunter", found: false }] }, always(0)).fragments).toBe(0);
    // A merchant and a storm are not the route's business.
    expect(resolveRoute({ ...quiet, encounters: [{ leg: 0, key: "merchant" }, { leg: 1, key: "storm" }] }, always(0)).lootMultiplier).toBe(1);
    // The shrine on leg 1 guards fork 1: the brutal fork's 0.3 becomes
    // 0.15, so a 0.2 roll misses.
    const shrined = resolveRoute({ ...quiet, choices: [null, "push"], encounters: [{ leg: 1, key: "shrine" }] }, script([0, 0.2, 0, 0.99]));
    expect(Object.values(fates(shrined))).toEqual(["home", "home", "home"]);
    const bare = resolveRoute({ ...quiet, choices: [null, "push"] }, script([0, 0.2, 0, 0.99]));
    expect(fates(bare)[1]).toBe("wounded");
  });

  it("never brings home more fragments than the claim will take", () => {
    const legend = { ...base, tier: "legend" as const, forks: 3, grade: "jackpot" as const, road: roadWith("legend", 2, "throne") };
    const many = resolveRoute(
      { ...legend, choices: [null, null, "push"], encounters: [{ leg: 0, key: "hunter", found: true }, { leg: 1, key: "hunter", found: true }, { leg: 2, key: "hunter", found: true }] },
      always(0.05),
    );
    expect(many.fragments).toBe(FRAGMENT_CAP);
  });
});

// === veterans and the run's memory ==========================================

import { SCOUTED_CAMP_RISK, VETERAN_HOLD_LOOT } from "./routes";
import { VETERAN_MILES } from "./trail";

describe("a Veteran's call", () => {
  const veteran = (id: number, role: string) => copy({ id, role, card: { trail: { miles: VETERAN_MILES, runs: 5, deepest: "legend" } } });
  const base = { insured: false, grade: "solid" as const, target: null, now };
  /** A road that matches the fixed forks, so the numbers are the old ones. */
  const fixed = (tier: ExpeditionTierKey) => {
    for (let id = 1; id < 5000; id += 1) {
      const r = { runId: id, rules: ROAD_RULES, convoy: null };
      if (forksFor(tier, r).every((fork, index) => fork.key === FORKS[tier][index].key)) return r;
    }
    throw new Error("no fixed road");
  };

  it("a Veteran Jungle scouts at half risk; a green one at three-quarters", () => {
    // The brutal fork (wounded 0.3): a veteran scout rolls 0.15, a green
    // scout 0.225. A 0.2 roll wounds the green Jungle and not the veteran.
    const green = [copy({ id: 1, role: "Top" }), copy({ id: 2, role: "Jungle" }), copy({ id: 3 })];
    const vet = [copy({ id: 1, role: "Top" }), veteran(2, "Jungle"), copy({ id: 3 })];
    const hurt = resolveRoute({ ...base, copies: green, tier: "raid", forks: 2, road: fixed("raid"), choices: [null, "scout"] }, script([0.2, 0, 0.99]));
    expect(fates(hurt)[2]).toBe("wounded");
    const fine = resolveRoute({ ...base, copies: vet, tier: "raid", forks: 2, road: fixed("raid"), choices: [null, "scout"] }, script([0.2, 0, 0.99]));
    expect(Object.values(fates(fine))).toEqual(["home", "home", "home"]);
  });

  it("a Veteran Top holds for more, and a Veteran Mid roams for more", () => {
    const tops = [veteran(1, "Top"), copy({ id: 2 }), copy({ id: 3 })];
    expect(resolveRoute({ ...base, copies: tops, tier: "raid", forks: 2, road: fixed("raid"), choices: ["hold", null] }, always(0.99)).lootMultiplier).toBe(1 + VETERAN_HOLD_LOOT);
    const mids = [veteran(1, "Mid"), copy({ id: 2 }), copy({ id: 3 })];
    // Fork 0 roam: two victims, no wounds (0.99s), reward miss.
    expect(resolveRoute({ ...base, copies: mids, tier: "raid", forks: 2, road: fixed("raid"), choices: ["roam", null] }, always(0.99)).lootMultiplier).toBe(1.44); // 1 + 0.25 × 1.75, rounded to the cent
  });

  it("only the caller has to be the Veteran, and the one with more miles makes the call", () => {
    // A Veteran Top does not sharpen the Jungle's scout.
    const mixed = [veteran(1, "Top"), copy({ id: 2, role: "Jungle" }), copy({ id: 3 })];
    const hurt = resolveRoute({ ...base, copies: mixed, tier: "raid", forks: 2, road: fixed("raid"), choices: [null, "scout"] }, script([0.2, 0, 0.99]));
    expect(fates(hurt)[2]).toBe("wounded");
    // Two Junglers: the veteran goes in first and takes the harm.
    const two = [copy({ id: 1, role: "Jungle" }), veteran(2, "Jungle"), copy({ id: 3 })];
    const result = resolveRoute({ ...base, copies: two, tier: "raid", forks: 2, road: fixed("raid"), choices: [null, "scout"] }, script([0.99, 0.1, 0, 0.99]));
    // With two Junglers the road picks (0.99 → the second, card 2), and
    // the veteran shape holds: 0.1 < 0.15 wounds them.
    expect(fates(result)[2]).toBe("wounded");
  });

  it("tells the button the call is sharper in a Veteran's hands", () => {
    const vet = [veteran(1, "Support"), copy({ id: 2 }), copy({ id: 3 })];
    const ward = forkOptions("raid", 0, vet, [], fixed("raid")).find((o) => o.choice === "ward")!;
    expect(ward.tease).toMatch(/Veteran Support/);
    const green = forkOptions("raid", 0, squad().map((c, i) => ({ ...c, role: i === 0 ? "Support" : "Mid" })) as CardCopy[], [], fixed("raid")).find((o) => o.choice === "ward")!;
    expect(green.tease).not.toMatch(/Veteran/);
  });
});

describe("the run's memory", () => {
  const base = { copies: squad(), insured: false, grade: "solid" as const, target: null, now };
  const roadWith = (tier: ExpeditionTierKey, wanted: string[]) => {
    for (let id = 1; id < 20000; id += 1) {
      const r = { runId: id, rules: ROAD_RULES, convoy: null };
      if (forksFor(tier, r).every((fork, index) => fork.key === wanted[index])) return r;
    }
    throw new Error(`no run draws ${wanted.join(">")}`);
  };

  it("a toll paid at one gate is good for the next", () => {
    // The moneylender's stair (gilded slot 1, toll 0.3) after the counting
    // house (no toll): nothing to remember, so the stair charges.
    const stairs = roadWith("gilded", ["ledgers", "stair"]);
    const charged = resolveRoute({ ...base, tier: "gilded", forks: 2, road: stairs, choices: ["camp", "camp"] }, always(0.1));
    expect(charged.lootMultiplier).toBe(1 - TOLL_LOOT);
    expect(charged.events.filter((e) => /paid it/.test(e.text))).toHaveLength(1);
    // The toll bridge (slot 0, toll 0.3) then the stair: the bridge's toll
    // is paid once, and the stair keeper waves them through.
    const bridged = roadWith("gilded", ["toll", "stair"]);
    const paid = resolveRoute({ ...base, tier: "gilded", forks: 2, road: bridged, choices: ["camp", "camp"] }, always(0.1));
    expect(paid.lootMultiplier).toBe(1 - TOLL_LOOT);
    expect(paid.events.filter((e) => /paid it/.test(e.text))).toHaveLength(1);
    expect(paid.events.some((e) => /good for this one/.test(e.text))).toBe(true);
    // Not paid at the bridge (0.5 > 0.3): the stair charges as it always did.
    const unpaid = resolveRoute({ ...base, tier: "gilded", forks: 2, road: bridged, choices: ["camp", "camp"] }, script([0.5, 0.1]));
    expect(unpaid.lootMultiplier).toBe(1 - TOLL_LOOT);
    expect(unpaid.events.some((e) => /good for this one/.test(e.text))).toBe(false);
    // A push at the bridge pays no toll and remembers none.
    const waded = resolveRoute({ ...base, tier: "gilded", forks: 2, road: bridged, choices: ["push", "camp"] }, always(0.99));
    expect(waded.events.some((e) => /good for this one/.test(e.text))).toBe(false);
  });

  it("a scout at one fork means the squad knows where not to camp at the next", () => {
    const junglers = [copy({ id: 1, role: "Jungle" }), copy({ id: 2 }), copy({ id: 3 })];
    // Legend, fixed road: scout the shaft (wounded 0.2 × 0.75 = 0.15; roll
    // 0.99 misses; reward pick 0, chance 0.99 miss), then camp at the
    // wrong checkpoint: haunted 0.15 × SCOUTED_CAMP_RISK = 0.075. A 0.1
    // roll haunts a squad that did not scout and not one that did.
    const road = (() => {
      for (let id = 1; id < 5000; id += 1) {
        const r = { runId: id, rules: ROAD_RULES, convoy: null };
        if (forksFor("legend", r).every((fork, index) => fork.key === FORKS.legend[index].key)) return r;
      }
      throw new Error("no fixed road");
    })();
    const knowing = resolveRoute({ ...base, copies: junglers, tier: "legend", forks: 3, road, choices: ["scout", "camp", null] }, script([0.99, 0, 0.99, 0.1, 0]));
    expect(Object.values(mutations(knowing))).toEqual([null, null, null]);
    expect(knowing.events.some((e) => /knew where not to sleep/.test(e.text))).toBe(true);
    const blind = resolveRoute({ ...base, copies: junglers, tier: "legend", forks: 3, road, choices: ["push", "camp", null] }, script([0, 0.99, 0, 0.99, 0.1, 0]));
    expect(Object.values(mutations(blind))).toContain("haunted");
    expect(SCOUTED_CAMP_RISK).toBe(0.5);
  });
});

import { COMPANY_RULES, GHOST_HAUNT, GHOST_HAUNT_FLOOR } from "./routes";

describe("company on the road", () => {
  const base = { copies: squad(), insured: false, grade: "solid" as const, target: null, now };
  const fixedRoad = (tier: ExpeditionTierKey) => {
    for (let id = 1; id < 20000; id += 1) {
      const r = { runId: id, rules: ROAD_RULES, convoy: null };
      if (forksFor(tier, r).every((fork, slot) => fork.key === FORKS[tier][slot].key)) return r;
    }
    throw new Error(`no run draws the fixed road on ${tier}`);
  };

  it("a named rival pays or costs what the coin did, and the event says who", () => {
    const won = resolveRoute({ ...base, tier: "raid", forks: 2, road: fixedRoad("raid"), choices: ["camp", "camp"], encounters: [{ leg: 0, key: "rival", won: true, rivalName: "Doug" }] }, always(0.99));
    expect(won.lootMultiplier).toBe(1 + RIVAL_WIN_LOOT);
    expect(won.events.some((e) => /Doug's squad on the same trail, and yours got there first/.test(e.text))).toBe(true);
    const lost = resolveRoute({ ...base, tier: "raid", forks: 2, road: fixedRoad("raid"), choices: ["camp", "camp"], encounters: [{ leg: 0, key: "rival", won: false, rivalName: "Doug" }] }, always(0.99));
    expect(lost.lootMultiplier).toBe(1 - RIVAL_LOSS_LOOT);
    expect(lost.events.some((e) => /Doug's squad on the same trail got there first/.test(e.text))).toBe(true);
  });

  it("an empty road holds a cache where the rival would have stood", () => {
    const alone = resolveRoute({ ...base, tier: "raid", forks: 2, road: fixedRoad("raid"), choices: ["camp", "camp"], encounters: [{ leg: 0, key: "rival", won: false, alone: true }] }, always(0.99));
    expect(alone.lootMultiplier).toBe(1 + CACHE_LOOT);
    expect(alone.events.some((e) => /road was the squad's alone/.test(e.text))).toBe(true);
  });

  it("a ghost makes the next camp a bad one: doubled, and never under the floor", () => {
    // The Legend Hunt's first checkpoint has no haunting of its own; with
    // a ghost on leg 0 the camp there is rolled at the floor.
    const road = fixedRoad("legend");
    const quiet = resolveRoute({ ...base, tier: "legend", forks: 3, road, choices: ["camp", "push", "push"], encounters: [] }, script([0.1, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99]));
    expect(Object.values(mutations(quiet))).toEqual([null, null, null]);
    const walked = resolveRoute({ ...base, tier: "legend", forks: 3, road, choices: ["camp", "push", "push"], encounters: [{ leg: 0, key: "ghost", ghost: { name: "Faker", stood: false } }] }, script([0.1, 0, 0.99, 0.99, 0.99, 0.99, 0.99]));
    expect(Object.values(mutations(walked))).toContain("haunted");
    expect(walked.events.some((e) => /the ghost sat at the fire all night/.test(e.text))).toBe(true);
    // 0.25 is over the floor: the ghost walked the edge and took nothing.
    const held = resolveRoute({ ...base, tier: "legend", forks: 3, road, choices: ["camp", "push", "push"], encounters: [{ leg: 0, key: "ghost", ghost: { name: "Faker", stood: false } }] }, script([0.25, 0.99, 0.99, 0.99, 0.99, 0.99]));
    expect(Object.values(mutations(held))).toEqual([null, null, null]);
    expect(held.events.some((e) => /walked the camp's edge all night and took nothing/.test(e.text))).toBe(true);
    // A push at the fork after it: the ghost cannot follow.
    const pushed = resolveRoute({ ...base, tier: "legend", forks: 3, road, choices: ["push", "camp", "camp"], encounters: [{ leg: 0, key: "ghost", ghost: { name: "Faker", stood: false } }] }, always(0.99));
    expect(pushed.events.some((e) => /ghost/.test(e.text))).toBe(false);
    expect(GHOST_HAUNT).toBe(2);
    expect(GHOST_HAUNT_FLOOR).toBe(0.2);
    expect(COMPANY_RULES).toBe(4);
  });

  it("a ghost that knows the squad's colours stands aside and leaves a cache", () => {
    const road = fixedRoad("legend");
    const stood = resolveRoute({ ...base, tier: "legend", forks: 3, road, choices: ["camp", "camp", "camp"], encounters: [{ leg: 0, key: "ghost", ghost: { name: "Faker", stood: true } }] }, always(0.99));
    expect(stood.lootMultiplier).toBe(1 + CACHE_LOOT);
    expect(stood.events.some((e) => /Faker's ghost knew the squad's colours and stood aside/.test(e.text))).toBe(true);
    expect(Object.values(mutations(stood))).toEqual([null, null, null]);
  });
});

import { tollCost, underWeather } from "./routes";
import { DROUGHT_GAMBLE, WATCH_TOLL } from "./weather";

describe("the weather on the road", () => {
  const base = { copies: squad(), insured: false, grade: "solid" as const, target: null, now };
  const fixedRoad = (tier: ExpeditionTierKey) => {
    for (let id = 1; id < 20000; id += 1) {
      const r = { runId: id, rules: ROAD_RULES, convoy: null };
      if (forksFor(tier, r).every((fork, slot) => fork.key === FORKS[tier][slot].key)) return r;
    }
    throw new Error(`no run draws the fixed road on ${tier}`);
  };
  const foils = [copy({ id: 1, foil: true }), copy({ id: 2 }), copy({ id: 3 })];

  it("under Fog every fork is dark, so a foil can light any of them", () => {
    const road = fixedRoad("raid");
    const bright = forksFor("raid", road).find((fork) => !fork.dark)!;
    expect(underWeather(bright, "fog").dark).toBe(true);
    expect(underWeather(bright, "clear")).toBe(bright);
    const slot = forksFor("raid", road).findIndex((fork) => !fork.dark);
    expect(forkOptions("raid", slot, foils, [], road).find((o) => o.choice === "light")!.locked).toBe("This fork is not dark.");
    expect(forkOptions("raid", slot, foils, [], road, "fog").find((o) => o.choice === "light")!.locked).toBeNull();
    expect(choiceAllowed("raid", slot, "light", foils, [], road, "fog")).toBe(true);
    expect(choiceAllowed("raid", slot, "light", foils, [], road)).toBe(false);
    // And the resolver reads the light where the page allowed it.
    const choices = Array.from({ length: 2 }, (_, index) => (index === slot ? "light" : "camp")) as ("light" | "camp")[];
    const lit = resolveRoute({ ...base, copies: foils, tier: "raid", forks: 2, road, choices, weather: "fog" }, always(0.99));
    expect(lit.pushes).toBe(1);
    const unlit = resolveRoute({ ...base, copies: foils, tier: "raid", forks: 2, road, choices }, always(0.99));
    expect(unlit.pushes).toBe(0);
  });

  it("under a Drought the scouting coin flip pays half", () => {
    const road = fixedRoad("scout");
    const flip = forksFor("scout", road)[0];
    expect(flip.gamble).not.toBeNull();
    expect(underWeather(flip, "drought").lootBonus).toBe(flip.lootBonus * DROUGHT_GAMBLE);
    const dry = resolveRoute({ ...base, tier: "scout", forks: 1, road, choices: ["push"], weather: "drought" }, always(0.99));
    const wet = resolveRoute({ ...base, tier: "scout", forks: 1, road, choices: ["push"] }, always(0.99));
    expect(dry.lootMultiplier).toBe(1 + Math.round(flip.lootBonus * DROUGHT_GAMBLE * 100) / 100);
    expect(wet.lootMultiplier).toBe(1 + flip.lootBonus);
  });

  it("under a Harvest the toll is waived, and under the Watch it costs double", () => {
    const road = fixedRoad("gilded");
    const gate = forksFor("gilded", road)[0];
    expect(gate.toll).toBeGreaterThan(0);
    expect(underWeather(gate, "harvest").toll).toBeUndefined();
    expect(tollCost("watch")).toBe(TOLL_LOOT * WATCH_TOLL);
    expect(tollCost("harvest")).toBe(TOLL_LOOT);
    const paid = resolveRoute({ ...base, tier: "gilded", forks: 2, road, choices: ["camp", "push"] }, script([0.1, 0.99, 0.99, 0.99, 0.99]));
    const free = resolveRoute({ ...base, tier: "gilded", forks: 2, road, choices: ["camp", "push"], weather: "harvest" }, script([0.1, 0.99, 0.99, 0.99, 0.99]));
    const watched = resolveRoute({ ...base, tier: "gilded", forks: 2, road, choices: ["camp", "push"], weather: "watch" }, script([0.1, 0.99, 0.99, 0.99, 0.99]));
    expect(paid.lootMultiplier).toBe(Math.round((free.lootMultiplier - TOLL_LOOT) * 100) / 100);
    expect(watched.lootMultiplier).toBe(Math.round((free.lootMultiplier - TOLL_LOOT * WATCH_TOLL) * 100) / 100);
    expect(forkOptions("gilded", 0, squad(), [], road, "watch").find((o) => o.choice === "camp")!.tease).toContain(`${Math.round(TOLL_LOOT * WATCH_TOLL * 100)}%`);
    expect(forkOptions("gilded", 0, squad(), [], road, "harvest").find((o) => o.choice === "camp")!.tease).not.toContain("costs");
  });
});

describe("a road handed down", () => {
  it("walks the places a campaign names, and draws the rest", () => {
    expect(forksFor("raid", { runId: 5, rules: ROAD_RULES, places: ["waterworks", "pits"] }).map((fork) => fork.key)).toEqual(["waterworks", "pits"]);
    const drawn = forksFor("raid", { runId: 5, rules: ROAD_RULES });
    const half = forksFor("raid", { runId: 5, rules: ROAD_RULES, places: ["nowhere", "pits"] });
    expect(half[0].key).toBe(drawn[0].key);
    expect(half[1].key).toBe("pits");
    expect(forksFor("legendary", { runId: 5, rules: ROAD_RULES, places: ["doors", "choir", "tide", "table"] }).map((fork) => fork.key)).toEqual(["doors", "choir", "tide", "table"]);
    // Below the road rulebook the fixed forks stand, whatever is asked.
    expect(forksFor("raid", { runId: 5, rules: 2, places: ["pits", "pits"] }).map((fork) => fork.key)).toEqual(FORKS.raid.map((fork) => fork.key));
  });
});
