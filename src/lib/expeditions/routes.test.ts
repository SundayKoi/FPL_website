import { describe, expect, it } from "vitest";
import type { CardCopy } from "./config";
import { EXPEDITION_TIERS, isProtected, squadMeets, woundedUntil, ransomFor, TIER_ORDER } from "./config";
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
  it("has six runs, in the order the board prints them", () => {
    expect(TIER_ORDER).toEqual(["scout", "raid", "legend", "rescue", "exorcism", "legendary"]);
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
