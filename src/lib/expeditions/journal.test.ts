import { describe, expect, it } from "vitest";
import type { CardCopy } from "./config";
import { MERCHANT_DOLLARS } from "./config";
import { banterFor, encountersFor, journalFor, latestJournalLine, STORM_HOURS } from "./journal";

const copy = (id: number, over: Partial<Record<keyof CardCopy, unknown>> = {}) =>
  ({ id, playerName: `Card ${id}`, role: "Mid", signed: false, foil: false, card: {}, ...over }) as unknown as CardCopy;
const squad = [copy(1, { role: "Top" }), copy(2, { role: "Support" }), copy(3, { role: "Jungle" })];

// A 24h raid with two forks: legs at 0-8h, 8-16h, 16-24h.
const raid = { id: 42, tier: "raid" as const, startedAt: "2026-09-04T00:00:00Z", resolvesAt: "2026-09-05T00:00:00Z", forks: 2 };

describe("the trail journal", () => {
  it("is the same journal every time it is read", () => {
    const now = new Date("2026-09-04T20:00:00Z");
    expect(journalFor(raid, squad, now)).toEqual(journalFor(raid, squad, now));
    expect(encountersFor(raid)).toEqual(encountersFor(raid));
  });

  it("writes lines as the squad reaches them, and nothing from the future", () => {
    const early = journalFor(raid, squad, new Date("2026-09-04T01:00:00Z"));
    expect(early).toEqual([]);
    const afterFirst = journalFor(raid, squad, new Date("2026-09-04T03:00:00Z"));
    expect(afterFirst).toHaveLength(1);
    expect(afterFirst[0]).toMatchObject({ leg: 0, kind: "trail" });
    const arrived = journalFor(raid, squad, new Date("2026-09-04T08:00:00Z"));
    expect(arrived[arrived.length - 1]).toMatchObject({ kind: "arrive", text: expect.stringMatching(/reached the reactor/) });
    for (const entry of arrived) expect(entry.at.getTime()).toBeLessThanOrEqual(Date.parse("2026-09-04T08:00:00Z"));
  });

  it("names a squad member, never a placeholder", () => {
    const entries = journalFor(raid, squad, new Date("2026-09-06T00:00:00Z"));
    expect(entries.length).toBeGreaterThan(6);
    for (const entry of entries) {
      expect(entry.text).not.toMatch(/\{name\}|\{role\}/);
    }
    expect(entries.some((entry) => /Card [123]/.test(entry.text))).toBe(true);
    expect(entries[entries.length - 1]).toMatchObject({ kind: "home" });
  });

  it("shows every line once the run is claimed, whatever the clock says", () => {
    const claimed = journalFor({ ...raid, claimedAt: "2026-09-05T01:00:00Z" }, squad, new Date("2026-09-04T00:30:00Z"));
    expect(claimed[claimed.length - 1].kind).toBe("home");
  });

  it("quotes the newest line for the ping", () => {
    expect(latestJournalLine(raid, squad, new Date("2026-09-04T00:30:00Z"))).toBeNull();
    const line = latestJournalLine(raid, squad, new Date("2026-09-04T08:00:00Z"));
    expect(line).toMatch(/reached the reactor/);
  });

  it("carries encounters on some legs, never on an exorcism or a run without forks", () => {
    // Over many runs the chance lands: some carry one, not all.
    const runs = Array.from({ length: 60 }, (_, index) => ({ ...raid, id: index + 1 }));
    const counts = runs.map((run) => encountersFor(run).length);
    expect(counts.some((count) => count > 0)).toBe(true);
    expect(counts.some((count) => count === 0)).toBe(true);
    expect(encountersFor({ ...raid, tier: "exorcism", forks: 0 })).toEqual([]);
    expect(encountersFor({ ...raid, forks: 0 })).toEqual([]);
    // A stranded card only turns up on a route that can lose one.
    const raidKeys = new Set(runs.flatMap((run) => encountersFor(run).map((entry) => entry.key)));
    expect(raidKeys.has("stranded")).toBe(false);
    const legendKeys = new Set(
      Array.from({ length: 200 }, (_, index) => ({ ...raid, id: index + 1, tier: "legend" as const, forks: 3 })).flatMap((run) =>
        encountersFor(run).map((entry) => entry.key),
      ),
    );
    expect(legendKeys.has("stranded")).toBe(true);
  });

  it("puts an encounter in the journal at the middle of its leg, in words that quote the numbers", () => {
    const withOne = Array.from({ length: 80 }, (_, index) => ({ ...raid, id: index + 1 })).find((run) => encountersFor(run).length > 0)!;
    const encounter = encountersFor(withOne)[0];
    const entries = journalFor(withOne, squad, new Date("2026-09-06T00:00:00Z"));
    const entry = entries.find((line) => line.kind === "encounter")!;
    expect(entry.encounter).toBe(encounter.key);
    expect(entry.at).toEqual(encounter.at);
    if (encounter.key === "merchant") expect(entry.text).toContain(String(MERCHANT_DOLLARS));
    if (encounter.key === "storm") expect(entry.text).toContain(`${STORM_HOURS} hours`);
  });
});

describe("squad banter", () => {
  it("lets teammates speak first", () => {
    const mates = [copy(1, { card: { teamName: "OMH" } }), copy(2, { card: { teamName: "OMH" } }), copy(3)];
    const lines = Array.from({ length: 20 }, (_, index) => banterFor("legend", 1, mates, index));
    expect(lines.some((line) => /vouch for each other/.test(line ?? ""))).toBe(true);
  });

  it("speaks in a role's voice for a plain squad, and says nothing for nobody", () => {
    const line = banterFor("raid", 0, squad, 7);
    expect(line).toMatch(/Card [123]/);
    expect(banterFor("raid", 0, [], 7)).toBeNull();
  });

  it("mentions the light only at a dark fork", () => {
    const foil = [copy(1, { foil: true })];
    const dark = Array.from({ length: 30 }, (_, index) => banterFor("raid", 1, foil, index));
    const bright = Array.from({ length: 30 }, (_, index) => banterFor("raid", 0, foil, index));
    expect(dark.some((line) => /light the way/.test(line ?? ""))).toBe(true);
    expect(bright.some((line) => /light the way/.test(line ?? ""))).toBe(false);
  });
});

// === the road's journal =======================================================

import { ROAD_RULES, forksFor } from "./routes";
import { ENCOUNTER_CHANCE, ROAD_ENCOUNTER_CHANCE } from "./journal";

describe("the road's journal", () => {
  const onRoad = { ...raid, rules: ROAD_RULES };
  const legendary = { id: 77, tier: "legendary" as const, startedAt: "2026-09-04T00:00:00Z", resolvesAt: "2026-09-07T00:00:00Z", forks: 4, rules: ROAD_RULES };
  const whole = (run: typeof onRoad | typeof legendary, members = squad) => journalFor(run, members, new Date("2026-09-10T00:00:00Z"));

  it("keeps a run stamped before the road on the journal it set out with", () => {
    // Same run, same squad: the legacy voice, word for word, whatever
    // the pools above it now say.
    const before = journalFor(raid, squad, new Date("2026-09-06T00:00:00Z"));
    expect(before.some((entry) => /reached the reactor/.test(entry.text))).toBe(true);
    expect(journalFor({ ...raid, rules: 2 }, squad, new Date("2026-09-06T00:00:00Z"))).toEqual(before);
  });

  it("is the same journal every time it is read, and names the run's own road", () => {
    expect(whole(onRoad)).toEqual(whole(onRoad));
    const first = forksFor("raid", { runId: onRoad.id, rules: ROAD_RULES, forks: 2 })[0];
    expect(whole(onRoad).some((entry) => entry.kind === "arrive" && entry.text.includes(first.title.toLowerCase()))).toBe(true);
  });

  it("never repeats a trail line inside one run, even on the longest route", () => {
    const lines = whole(legendary).filter((entry) => entry.kind === "trail").map((entry) => entry.text);
    expect(lines.length).toBe(10);
    expect(new Set(lines).size).toBe(lines.length);
  });

  it("speaks in each role's own voice, and only for roles the squad fielded", () => {
    const entries = whole(legendary);
    const text = entries.map((entry) => entry.text).join("\n");
    // Card 1 is the Top, 2 the Support, 3 the Jungle: their lines are the
    // role's, not a generic member's.
    expect(text).toMatch(/Card 1 .*(island|heaviest pack|wall lost|hold the rear|fallen tree|way home|weather|back to it)/);
    expect(text).toMatch(/Card 3 .*(route nobody else|timer|perimeter|camp before|far side|next three stops|crossing|wind)/);
    expect(text).toMatch(/Card 2 .*(fire lit|marker|limping|stop for the night|watch all night|counted heads|lantern|talking)/);
    // No Mid or Bot on the squad, so nobody wants to push on for the fourth time.
    expect(text).not.toMatch(/said so four times/);
    for (const entry of entries) expect(entry.text).not.toMatch(/\{name\}|\{role\}|\{title\}/);
  });

  it("a different squad on the same road hears different voices", () => {
    const bots = [copy(4, { role: "Bot" }), copy(5, { role: "Mid" }), copy(6, { role: "Bot" })];
    const a = whole(legendary).filter((entry) => entry.kind === "trail").map((entry) => entry.text);
    const b = whole(legendary, bots).filter((entry) => entry.kind === "trail").map((entry) => entry.text);
    expect(a).not.toEqual(b);
    expect(b.join("\n")).toMatch(/Card [456]/);
  });

  it("meets the road's encounters, and tosses the rival's and the hunter's coins once", () => {
    const runs = Array.from({ length: 400 }, (_, index) => ({ ...legendary, id: index + 1 }));
    const all = runs.flatMap((run) => encountersFor(run));
    const keys = new Set<string>(all.map((entry) => entry.key));
    for (const key of ["merchant", "storm", "cache", "rival", "shrine", "hunter", "stranded"]) expect(keys.has(key)).toBe(true);
    expect(all.filter((entry) => entry.key === "rival").every((entry) => typeof entry.won === "boolean")).toBe(true);
    expect(all.filter((entry) => entry.key === "hunter").every((entry) => typeof entry.found === "boolean")).toBe(true);
    expect(all.some((entry) => entry.key === "rival" && entry.won)).toBe(true);
    expect(all.some((entry) => entry.key === "rival" && !entry.won)).toBe(true);
    // More often than before, because there is more to meet.
    const rate = all.length / (runs.length * 5);
    expect(rate).toBeGreaterThan(ENCOUNTER_CHANCE);
    expect(rate).toBeLessThan(ROAD_ENCOUNTER_CHANCE + 0.05);
    // And the legacy set is untouched: a run at rules 2 never meets a cache.
    const legacy = new Set<string>(runs.flatMap((run) => encountersFor({ ...run, rules: 2 }).map((entry) => entry.key)));
    expect(legacy.has("cache")).toBe(false);
    expect(legacy.has("shrine")).toBe(false);
  });

  it("writes the rival's and the hunter's lines the way the coin fell", () => {
    const runs = Array.from({ length: 400 }, (_, index) => ({ ...legendary, id: index + 1 }));
    // A run can meet two rivals on two legs and lose one; read the line
    // on the leg whose coin is being checked.
    const lineOn = (run: typeof legendary, key: string, want: (entry: ReturnType<typeof encountersFor>[number]) => boolean) => {
      const encounter = encountersFor(run).find((entry) => entry.key === key && want(entry))!;
      return whole(run).find((entry) => entry.encounter === key && entry.leg === encounter.leg)?.text ?? "";
    };
    const won = runs.find((run) => encountersFor(run).some((entry) => entry.key === "rival" && entry.won))!;
    const lost = runs.find((run) => encountersFor(run).some((entry) => entry.key === "rival" && !entry.won))!;
    expect(lineOn(won, "rival", (entry) => entry.won === true)).toMatch(/more/);
    expect(lineOn(lost, "rival", (entry) => entry.won === false)).toMatch(/less/);
    const found = runs.find((run) => encountersFor(run).some((entry) => entry.key === "hunter" && entry.found))!;
    expect(lineOn(found, "hunter", (entry) => entry.found === true)).toMatch(/fragment|piece of a map/);
    const empty = runs.find((run) => encountersFor(run).some((entry) => entry.key === "hunter" && !entry.found))!;
    expect(lineOn(empty, "hunter", (entry) => entry.found === false)).toMatch(/empty pack|last fragment/);
  });
});

describe("banter on the road", () => {
  const road = (runId: number) => ({ runId, rules: ROAD_RULES, forks: 3 });

  it("gives each role more than one thing to say", () => {
    const tops = [copy(1, { role: "Top" })];
    const lines = new Set(Array.from({ length: 40 }, (_, index) => banterFor("legend", 0, tops, index, road(index))));
    expect(lines.size).toBeGreaterThan(2);
    for (const line of lines) expect(line).toMatch(/Card 1/);
  });

  it("dreads a warned fork out loud, sometimes", () => {
    const mids = [copy(1, { role: "Mid" })];
    const vault = Array.from({ length: 60 }, (_, index) => banterFor("legend", 2, mids, index, { ...road(index), runId: index }));
    // Only on a run whose third fork is actually warned — every legend
    // slot-2 place is — and never at the kind first fork.
    expect(vault.some((line) => /warned about|polite about it/.test(line ?? ""))).toBe(true);
    const shaft = Array.from({ length: 60 }, (_, index) => banterFor("legend", 0, mids, index, road(index)));
    expect(shaft.some((line) => /warned about|polite about it/.test(line ?? ""))).toBe(false);
  });

  it("keeps the legacy line for a run before the road", () => {
    const supports = [copy(1, { role: "Support" })];
    const legacy = new Set(Array.from({ length: 30 }, (_, index) => banterFor("raid", 0, supports, index)));
    expect([...legacy]).toEqual(["Card 1 wants to camp, light a fire and wait for daylight."]);
  });
});

describe("the Jungle back from ahead", () => {
  it("names the next place at the start of the leg after a scout", () => {
    const run = { ...raid, rules: ROAD_RULES, choices: [{ index: 0, choice: "scout" }] };
    const entries = journalFor(run, squad, new Date("2026-09-06T00:00:00Z"));
    const second = forksFor("raid", { runId: run.id, rules: ROAD_RULES, forks: 2 })[1];
    const early = entries.find((entry) => entry.leg === 1 && entry.text.includes(second.title.toLowerCase()) && /scouting ahead|sketch of the next stop/.test(entry.text));
    expect(early).toBeDefined();
    // At the start of the leg — before the leg's first trail line.
    const firstTrail = entries.find((entry) => entry.leg === 1 && entry.kind === "trail" && entry !== early)!;
    expect(early!.at.getTime()).toBeLessThan(firstTrail.at.getTime());
    // And in the Jungle's own name: Card 3 is the squad's Jungle.
    expect(early!.text).toMatch(/^Card 3/);
    // Without the scout, no such line.
    const plain = journalFor({ ...raid, rules: ROAD_RULES, choices: [{ index: 0, choice: "push" }] }, squad, new Date("2026-09-06T00:00:00Z"));
    expect(plain.some((entry) => /scouting ahead|sketch of the next stop/.test(entry.text))).toBe(false);
  });
});

import { COMPANY_RULES } from "./routes";
import type { RoadCompany } from "./company";

describe("company in the journal", () => {
  const legendary = { id: 1, tier: "legendary" as const, startedAt: "2026-09-04T00:00:00Z", resolvesAt: "2026-09-07T00:00:00Z", forks: 4, rules: COMPANY_RULES };
  const done = new Date("2026-09-08T00:00:00Z");
  const runs = Array.from({ length: 600 }, (_, index) => ({ ...legendary, id: index + 1 }));
  const withRival = runs.find((run) => encountersFor(run).some((entry) => entry.key === "rival"))!;
  const rivalLeg = encountersFor(withRival).find((entry) => entry.key === "rival")!.leg;
  const withGhost = runs.find((run) => encountersFor(run).some((entry) => entry.key === "ghost"))!;
  const ghostLeg = encountersFor(withGhost).find((entry) => entry.key === "ghost")!.leg;
  const lineOn = (run: typeof legendary, company: RoadCompany | null, leg: number, key: string) =>
    journalFor({ ...run, company }, squad, done).find((entry) => entry.encounter === key && entry.leg === leg)?.text ?? "";
  const company = (over: Partial<RoadCompany>): RoadCompany => ({ rivals: [], crossings: [], ghosts: [], ...over });

  it("names the rival and takes shine's verdict over the coin", () => {
    const beaten = company({ rivals: [{ leg: rivalLeg, runId: 9, who: "doug", name: "Doug", shine: 20, theirShine: 12, won: true }] });
    expect(lineOn(withRival, beaten, rivalLeg, "rival")).toMatch(/Doug/);
    expect(lineOn(withRival, beaten, rivalLeg, "rival")).toMatch(/more/);
    const beat = company({ rivals: [{ leg: rivalLeg, runId: 9, who: "doug", name: "Doug", shine: 12, theirShine: 20, won: false }] });
    expect(lineOn(withRival, beat, rivalLeg, "rival")).toMatch(/Doug/);
    expect(lineOn(withRival, beat, rivalLeg, "rival")).toMatch(/less/);
    // The encounter the claim reads carries the same verdict and the name.
    const read = encountersFor(withRival, beat).find((entry) => entry.leg === rivalLeg)!;
    expect(read).toMatchObject({ key: "rival", won: false, rivalName: "Doug" });
  });

  it("says the road was the squad's alone, and pays the cairn's cache", () => {
    expect(lineOn(withRival, company({}), rivalLeg, "rival")).toMatch(/alone|Nobody else out this way/);
    expect(encountersFor(withRival, company({})).find((entry) => entry.leg === rivalLeg)).toMatchObject({ key: "rival", alone: true });
    // Read without its company, the coin's line still stands.
    expect(lineOn(withRival, null, rivalLeg, "rival")).toMatch(/rival squad|Another squad/);
  });

  it("writes the other side of a meet at the hour it happened", () => {
    const at = new Date(Date.parse(legendary.startedAt) + 30 * 60 * 60 * 1000).toISOString();
    const crossed = company({ crossings: [{ at, runId: 77, who: "ann", name: "Ann", won: false }] });
    const entry = journalFor({ ...withRival, company: crossed }, squad, done).find((line) => line.text.includes("Ann"))!;
    expect(entry).toBeTruthy();
    expect(entry.at.toISOString()).toBe(at);
    expect(entry.kind).toBe("encounter");
    expect(entry.text).toMatch(/first|ahead/);
    // Not yet: a crossing in the future is not written.
    expect(journalFor({ ...withRival, company: crossed }, squad, new Date(Date.parse(at) - 1000)).some((line) => line.text.includes("Ann"))).toBe(false);
  });

  it("names the ghost and whose it was, and lets it stand aside for its colours", () => {
    const walking = company({ ghosts: [{ leg: ghostLeg, graveId: 3, cardName: "Faker", who: "doug", name: "Doug", team: "T1", stood: false }] });
    const line = lineOn(withGhost, walking, ghostLeg, "ghost");
    expect(line).toMatch(/Faker/);
    expect(line).toMatch(/Doug/);
    expect(line).toMatch(/2 times as likely/);
    const t1 = [copy(1, { role: "Top", card: { teamName: "T1" } }), copy(2, { role: "Support" }), copy(3, { role: "Jungle" })];
    const stood = company({ ghosts: [{ leg: ghostLeg, graveId: 3, cardName: "Faker", who: "doug", name: "Doug", team: "T1", stood: true }] });
    const aside = journalFor({ ...withGhost, company: stood }, t1, done).find((entry) => entry.encounter === "ghost" && entry.leg === ghostLeg)!.text;
    expect(aside).toMatch(/stood aside|stepped back/);
    expect(aside).toMatch(/Card 1/);
    expect(encountersFor(withGhost, stood).find((entry) => entry.leg === ghostLeg)).toMatchObject({ key: "ghost", ghost: { name: "Faker", stood: true } });
  });

  it("a ghost draw with nobody in the graveyard is a cache, and a run read without company keeps a nameless ghost", () => {
    expect(encountersFor(withGhost, company({})).find((entry) => entry.leg === ghostLeg)?.key).toBe("cache");
    expect(lineOn(withGhost, company({}), ghostLeg, "cache")).toMatch(/cache/);
    expect(lineOn(withGhost, null, ghostLeg, "ghost")).toMatch(/torchlight|Footsteps/);
    // Below the company rulebook: no ghost, whatever the graveyard holds.
    expect(encountersFor({ ...withGhost, rules: COMPANY_RULES - 1 }).find((entry) => entry.leg === ghostLeg)?.key).not.toBe("ghost");
  });
});
