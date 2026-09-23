import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import { ARCHETYPE_RULES } from "./archetypes";
import type { CardCopy } from "./config";
import type { ForkStatus } from "./forks";
import { REVEAL_FRAGMENTS, REVEAL_ORDER, dangerOf, knownCheckpoints, revealErrorMessage, wardenActive, type RevealRun } from "./reveal";
import { TRAILWORN_MILES, VETERAN_MILES, WAYFARER_MILES } from "./trail";

const copy = (id: number, archetype = "Jack of All Trades", miles = 0) =>
  ({ id, playerName: `Card ${id}`, role: "Mid", card: { archetype, ...(miles > 0 ? { trail: { miles, runs: 1, deepest: "legend" } } : {}) } }) as unknown as CardCopy;

const plain = () => [copy(1), copy(2), copy(3)];

const run = (over: Partial<RevealRun> = {}): RevealRun => ({ forks: 3, rules: ARCHETYPE_RULES, claimedAt: null, choices: [], road: null, ...over });

/** Three checkpoints standing as `statuses` say. */
const views = (...statuses: ForkStatus[]) => statuses.map((status, index) => ({ index, status }));

const NONE = { paid: false, partner: false };

const known = (map: Map<number, string>) => Object.fromEntries([...map.entries()].sort(([a], [b]) => a - b));

describe("what the squad knows of its road", () => {
  it("knows nothing ahead with nothing to see by, and every place it has reached", () => {
    expect(known(knownCheckpoints(run(), plain(), views("pending", "pending", "pending"), NONE))).toEqual({});
    expect(known(knownCheckpoints(run(), plain(), views("decided", "missed", "open"), NONE))).toEqual({ 0: "walked", 1: "walked", 2: "walked" });
    expect(known(knownCheckpoints(run(), plain(), views("decided", "open", "pending"), NONE))).toEqual({ 0: "walked", 1: "walked" });
  });

  it("names the place past a scout: the Jungle went ahead", () => {
    const scouted = run({ choices: [{ index: 0, choice: "scout" }] });
    expect(known(knownCheckpoints(scouted, plain(), views("decided", "pending", "pending"), NONE))).toEqual({ 0: "walked", 1: "scout" });
    // A scout at the last fork has nowhere further to look.
    const last = run({ choices: [{ index: 2, choice: "scout" }] });
    expect(known(knownCheckpoints(last, plain(), views("decided", "decided", "decided"), NONE))).toEqual({ 0: "walked", 1: "walked", 2: "walked" });
  });

  it("sees down the trail by the squad's best title: one place, two, or the whole road", () => {
    const at = views("pending", "pending", "pending");
    expect(known(knownCheckpoints(run(), [copy(1, undefined, TRAILWORN_MILES), copy(2), copy(3)], at, NONE))).toEqual({ 0: "trail" });
    expect(known(knownCheckpoints(run(), [copy(1, undefined, TRAILWORN_MILES), copy(2, undefined, VETERAN_MILES), copy(3)], at, NONE))).toEqual({ 0: "trail", 1: "trail" });
    expect(known(knownCheckpoints(run(), [copy(1), copy(2), copy(3, undefined, WAYFARER_MILES)], at, NONE))).toEqual({ 0: "trail", 1: "trail", 2: "trail" });
    // A card one mile short of the title sees nothing.
    expect(known(knownCheckpoints(run(), [copy(1, undefined, TRAILWORN_MILES - 1), copy(2), copy(3)], at, NONE))).toEqual({});
  });

  it("moves the sight on as each fork opens", () => {
    const squad = [copy(1, undefined, TRAILWORN_MILES), copy(2), copy(3)];
    expect(known(knownCheckpoints(run(), squad, views("open", "pending", "pending"), NONE))).toEqual({ 0: "walked", 1: "trail" });
    expect(known(knownCheckpoints(run(), squad, views("decided", "open", "pending"), NONE))).toEqual({ 0: "walked", 1: "walked", 2: "trail" });
  });

  it("reads the reveal edges under the edge rulebook only", () => {
    const at = views("pending", "pending", "pending");
    const jungle = [copy(1, "Jungle Diff"), copy(2), copy(3)];
    const warden = [copy(1, "The Warden"), copy(2), copy(3)];
    expect(known(knownCheckpoints(run(), jungle, at, NONE))).toEqual({ 0: "edge", 1: "edge" });
    expect(known(knownCheckpoints(run(), warden, at, NONE))).toEqual({ 0: "edge" });
    expect(known(knownCheckpoints(run({ rules: ARCHETYPE_RULES - 1 }), jungle, at, NONE))).toEqual({});
    expect(known(knownCheckpoints(run({ rules: ARCHETYPE_RULES - 1 }), warden, at, NONE))).toEqual({});
    // One reveal edge counts per squad: Jungle Diff outranks The Warden.
    expect(known(knownCheckpoints(run(), [copy(1, "The Warden"), copy(2, "Jungle Diff"), copy(3)], at, NONE))).toEqual({ 0: "edge", 1: "edge" });
    expect(wardenActive([copy(1, "The Warden"), copy(2, "Jungle Diff"), copy(3)], ARCHETYPE_RULES)).toBe(false);
    expect(wardenActive(warden, ARCHETYPE_RULES)).toBe(true);
    expect(wardenActive(warden, ARCHETYPE_RULES - 1)).toBe(false);
  });

  it("knows the whole road when it was handed down, paid for, shared by the convoy, or walked", () => {
    const at = views("open", "pending", "pending");
    expect(known(knownCheckpoints(run({ road: ["shaft", "village", "vault"] }), plain(), at, NONE))).toEqual({ 0: "walked", 1: "campaign", 2: "campaign" });
    expect(known(knownCheckpoints(run(), plain(), at, { paid: true, partner: false }))).toEqual({ 0: "walked", 1: "fragment", 2: "fragment" });
    expect(known(knownCheckpoints(run(), plain(), at, { paid: false, partner: true }))).toEqual({ 0: "walked", 1: "convoy", 2: "convoy" });
    expect(known(knownCheckpoints(run({ claimedAt: "2026-09-20T00:00:00.000Z" }), plain(), views("pending", "pending", "pending"), NONE))).toEqual({ 0: "walked", 1: "walked", 2: "walked" });
    // An empty handed-down road is no map at all.
    expect(known(knownCheckpoints(run({ road: [] }), plain(), at, NONE))).toEqual({ 0: "walked" });
  });

  it("names each place by the first reason in the order, whatever else also holds", () => {
    expect(REVEAL_ORDER).toEqual(["walked", "campaign", "fragment", "convoy", "scout", "edge", "trail"]);
    const everything = [copy(1, "Jungle Diff", WAYFARER_MILES), copy(2), copy(3)];
    const scouted = run({ choices: [{ index: 0, choice: "scout" }] });
    expect(known(knownCheckpoints(scouted, everything, views("decided", "pending", "pending"), NONE))).toEqual({ 0: "walked", 1: "scout", 2: "edge" });
    expect(known(knownCheckpoints(scouted, everything, views("decided", "pending", "pending"), { paid: true, partner: true }))).toEqual({ 0: "walked", 1: "fragment", 2: "fragment" });
  });

  it("never names a checkpoint the run does not have", () => {
    const squad = [copy(1, undefined, WAYFARER_MILES), copy(2), copy(3)];
    const short = run({ forks: 2, choices: [{ index: 1, choice: "scout" }] });
    expect(known(knownCheckpoints(short, squad, views("decided", "decided"), { paid: true, partner: true }))).toEqual({ 0: "walked", 1: "walked" });
    expect(knownCheckpoints(run({ forks: 0 }), squad, [], { paid: true, partner: false }).size).toBe(0);
  });
});

describe("what an unknown checkpoint gives away", () => {
  const fork = (over: { warned?: boolean; dark?: boolean; toll?: number }) => ({ warned: false, dark: false, ...over });

  it("always shows the dread mark, and nothing else without The Warden", () => {
    expect(dangerOf(fork({ warned: true, dark: true, toll: 0.4 }), false)).toEqual({ warned: true, dark: null, toll: null });
    expect(dangerOf(fork({}), false)).toEqual({ warned: false, dark: null, toll: null });
  });

  it("shows the dark and the toll to The Warden", () => {
    expect(dangerOf(fork({ warned: true, dark: true, toll: 0.4 }), true)).toEqual({ warned: true, dark: true, toll: true });
    expect(dangerOf(fork({}), true)).toEqual({ warned: false, dark: false, toll: false });
    expect(dangerOf(fork({ toll: 0 }), true).toll).toBe(false);
  });
});

describe("the price of a reveal", () => {
  it("is what reveal_expedition_road charges", () => {
    const dir = join(process.cwd(), "supabase/migrations");
    const latest = readdirSync(dir)
      .filter((name) => name.endsWith(".sql"))
      .sort()
      .reverse()
      .find((name) => readFileSync(join(dir, name), "utf8").includes("create or replace function public.reveal_expedition_road"));
    expect(latest).toBeDefined();
    const sql = readFileSync(join(dir, latest!), "utf8");
    const cost = sql.match(/v_cost\s+constant\s+int\s*:=\s*(\d+)\s*;/);
    expect(cost).not.toBeNull();
    expect(Number(cost![1])).toBe(REVEAL_FRAGMENTS);
  });

  it("says what each refusal means", () => {
    expect(revealErrorMessage("unknown run")).toMatch(/isn't yours/);
    expect(revealErrorMessage("already claimed")).toMatch(/already home/);
    expect(revealErrorMessage("nothing to reveal")).toMatch(/no checkpoints/);
    expect(revealErrorMessage("road already known")).toMatch(/set out with this map/);
    expect(revealErrorMessage("road already walked")).toMatch(/every checkpoint already/);
    expect(revealErrorMessage("already revealed")).toMatch(/already revealed/);
    expect(revealErrorMessage("not enough fragments")).toMatch(/1 map fragment/);
    expect(revealErrorMessage("Could not find the function public.reveal_expedition_road(p_run, p_user) in the schema cache")).toMatch(/nothing was spent/);
    expect(revealErrorMessage("connection reset")).toMatch(/Refresh and try again/);
  });
});
