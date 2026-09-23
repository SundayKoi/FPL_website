import { describe, expect, it, vi } from "vitest";

// views.ts is `import "server-only"` (it holds the road); vitest resolves
// that package's throwing default, so stand it in as runs.test.ts does.
vi.mock("server-only", () => ({}));

import { ARCHETYPE_RULES, abilitySheet } from "./archetypes";
import { boardFixture } from "./boardFixtures";
import type { RoadCompany } from "./company";
import type { CardCopy } from "./config";
import { choiceSheet, forkViews } from "./forks";
import { banterFor, encountersFor, journalFor } from "./journal";
import { roadOf, type ExpeditionRun } from "./queries";
import { forkOptions, forksFor, underWeather } from "./routes";
import { TRAILWORN_MILES } from "./trail";
import { RIVAL_FORK, buildRunViews, landmarkRefs, rivalStory, runViewFor, type KnownPlaceView, type RunView, type RunViewInput, type UnknownPlaceView } from "./views";

const HOUR = 3_600_000;
const now = new Date("2026-09-23T18:00:00.000Z");
const at = (hours: number) => new Date(now.getTime() + hours * HOUR).toISOString();

const copy = (id: number, role: string, archetype = "Jack of All Trades", over: Record<string, unknown> = {}) =>
  ({
    id,
    playerName: `Card ${id}`,
    role,
    tier: "gold",
    foil: false,
    foilType: null,
    signed: false,
    card: { archetype, teamName: null, ...over },
  }) as unknown as CardCopy;

const plain = () => [copy(1, "Top"), copy(2, "Jungle"), copy(3, "Mid")];

/** A Legend Hunt thirteen hours into forty-eight: the first checkpoint
 *  opened an hour ago, the other two are ahead. */
const legend = (over: Partial<ExpeditionRun> = {}): ExpeditionRun => ({
  id: 4242,
  tier: "legend",
  squad: [1, 2, 3],
  shine: 30,
  startedAt: at(-13),
  resolvesAt: at(35),
  outcome: null,
  claimedAt: null,
  forks: 3,
  choices: [],
  insured: false,
  target: null,
  fee: 0,
  encounters: [],
  rules: ARCHETYPE_RULES,
  convoy: null,
  campaign: null,
  road: null,
  company: null,
  weather: null,
  ...over,
});

const input = (over: Partial<RunViewInput> = {}): RunViewInput => ({
  run: legend(),
  copies: plain(),
  now,
  reveals: { paid: false, partner: false },
  ...over,
});

const knownAt = (view: RunView, index: number) => view.road[index] as KnownPlaceView;
const unknownAt = (view: RunView, index: number) => view.road[index] as UnknownPlaceView;

describe("the road as the squad knows it", () => {
  const view = runViewFor(input());
  const places = forksFor("legend", roadOf(legend()));

  it("names the places it has reached and hides the rest", () => {
    expect(view.road.map((place) => place.known)).toEqual([true, false, false]);
    expect(knownAt(view, 0)).toMatchObject({ index: 0, known: true, key: places[0].key, title: places[0].title, status: "open", revealedBy: "walked", landmark: null });
  });

  it("leaves an unknown place's key, title and story out of the view entirely", () => {
    for (const index of [1, 2]) {
      const place = unknownAt(view, index);
      expect(Object.keys(place).sort()).toEqual(["at", "closesAt", "dark", "index", "known", "mark", "opensAt", "pushed", "status", "toll", "warned"]);
      expect(place.mark).toBe("?");
      expect(place.status).toBe("pending");
    }
    // Not in any field, any line, any option: nowhere in what is sent.
    const sent = JSON.stringify(view).toLowerCase();
    for (const hidden of places.slice(1)) {
      expect(sent).not.toContain(hidden.title.toLowerCase());
      expect(sent).not.toContain(hidden.story.toLowerCase());
      expect(sent).not.toContain(`"${hidden.key}"`);
    }
  });

  it("shows the dread mark on an unknown place, and its dark and toll only to The Warden", () => {
    for (const index of [1, 2]) {
      expect(unknownAt(view, index)).toMatchObject({ warned: places[index].warned, dark: null, toll: null });
    }
    const warden = runViewFor(input({ copies: [copy(1, "Top", "The Warden"), copy(2, "Jungle"), copy(3, "Mid")], run: legend({ weather: "fog" }) }));
    // The Warden sees the next place, and the danger of the one after it —
    // as the week's weather leaves it: under Fog, every fork is dark.
    expect(warden.road.map((place) => place.known)).toEqual([true, true, false]);
    const fogged = underWeather(places[2], "fog");
    expect(unknownAt(warden, 2)).toMatchObject({ warned: fogged.warned, dark: true, toll: (fogged.toll ?? 0) > 0 });
  });

  it("places each checkpoint along the run's clock", () => {
    expect(view.road.map((place) => place.at)).toEqual([0.25, 0.5, 0.75]);
    expect(view.road.map((place) => place.opensAt)).toEqual([at(-1), at(11), at(23)]);
  });

  it("lets the trail, a scout and the edges see ahead, as reveal.ts rules", () => {
    const veteran = runViewFor(input({ copies: [copy(1, "Top", undefined, { trail: { miles: TRAILWORN_MILES, runs: 3, deepest: "legend" } }), copy(2, "Jungle"), copy(3, "Mid")] }));
    expect(veteran.road.map((place) => (place.known ? place.revealedBy : null))).toEqual(["walked", "trail", null]);
    const jungle = runViewFor(input({ copies: [copy(1, "Top"), copy(2, "Jungle", "Jungle Diff"), copy(3, "Mid")] }));
    expect(jungle.road.map((place) => (place.known ? place.revealedBy : null))).toEqual(["walked", "edge", "edge"]);
    // Below the edge rulebook, Jungle Diff is only a title.
    const old = runViewFor(input({ run: legend({ rules: ARCHETYPE_RULES - 1 }), copies: [copy(1, "Top"), copy(2, "Jungle", "Jungle Diff"), copy(3, "Mid")] }));
    expect(old.road.map((place) => place.known)).toEqual([true, false, false]);
    const scouted = runViewFor(input({ run: legend({ choices: [{ index: 0, choice: "scout", at: at(-0.5) }] }) }));
    expect(scouted.road.map((place) => (place.known ? place.revealedBy : null))).toEqual(["walked", "scout", null]);
    expect(knownAt(scouted, 0)).toMatchObject({ status: "decided", choice: "scout", pushed: true });
  });

  it("knows the whole road once it is paid for, or shared by the convoy", () => {
    const paid = runViewFor(input({ reveals: { paid: true, partner: false } }));
    expect(paid.road.map((place) => (place.known ? place.revealedBy : null))).toEqual(["walked", "fragment", "fragment"]);
    expect((paid.road as KnownPlaceView[]).map((place) => place.title)).toEqual(places.map((place) => place.title));
    const shared = runViewFor(input({ reveals: { paid: false, partner: true }, partnerName: "Rio" }));
    expect(shared.road.map((place) => (place.known ? place.revealedBy : null))).toEqual(["walked", "convoy", "convoy"]);
  });

  it("walks a campaign's road, handed down and known from the start", () => {
    const handed = legend({ campaign: 12, road: ["furnaces", "belltower", "sleeper"] });
    const campaign = runViewFor(input({ run: handed }));
    expect((campaign.road as KnownPlaceView[]).map((place) => [place.key, place.revealedBy])).toEqual([
      ["furnaces", "walked"],
      ["belltower", "campaign"],
      ["sleeper", "campaign"],
    ]);
  });

  it("carries a landmark on a known place only", () => {
    const named = runViewFor(input({ landmarks: places.map((place) => ({ place: place.key, by: "Ana", mine: false, crest: true })) }));
    expect(knownAt(named, 0).landmark).toEqual({ by: "Ana", mine: false, crest: true });
    expect("landmark" in named.road[1]).toBe(false);
  });

  it("fills a known place's landmark from the season's landmarks as fetched", () => {
    const fetched = [
      { season: "S5", place: places[0].key, discordId: "42", username: "Me", runId: 11, reachedAt: at(-40) },
      { season: "S5", place: places[1].key, discordId: "77", username: "Ana", runId: 12, reachedAt: at(-30) },
    ];
    const refs = landmarkRefs(fetched, "42", new Set(["77"]));
    expect(refs).toEqual([
      { place: places[0].key, by: "Me", mine: true, crest: false },
      { place: places[1].key, by: "Ana", mine: false, crest: true },
    ]);
    const named = runViewFor(input({ landmarks: refs }));
    expect(knownAt(named, 0).landmark).toEqual({ by: "Me", mine: true, crest: false });
    // The second place is still ahead: its landmark stays on the server.
    expect(JSON.stringify(named)).not.toContain("Ana");
    // Landmarks that could not be read are none.
    expect(landmarkRefs(null, "42")).toEqual([]);
    expect(knownAt(runViewFor(input({ landmarks: landmarkRefs(null, "42") })), 0).landmark).toBeNull();
  });

  it("is plain data: what the page sends is what the board reads", () => {
    expect(JSON.parse(JSON.stringify(view))).toEqual(view);
  });
});

describe("the fork waiting on an answer", () => {
  it("carries the place, the story, the banter and this squad's options", () => {
    const run = legend();
    const view = runViewFor(input({ run }));
    const place = forksFor("legend", roadOf(run))[0];
    expect(view.openFork).toMatchObject({ index: 0, key: place.key, title: place.title, story: place.story, rivalStory: null, opensAt: at(-1), closesAt: at(11), last: false });
    expect(view.openFork!.banter).toBe(banterFor("legend", 0, plain(), run.id, roadOf(run)));
    expect(view.openFork!.options).toEqual(forkOptions("legend", 0, plain(), choiceSheet(3, []), roadOf(run), null));
  });

  it("brings the edges' words to the buttons under the edge rulebook", () => {
    const squad = [copy(1, "Top", "Unkillable"), copy(2, "Jungle"), copy(3, "Mid")];
    const view = runViewFor(input({ copies: squad }));
    const push = view.openFork!.options.find((option) => option.choice === "push")!;
    expect(push.edges?.map((edge) => edge.title)).toContain("Unkillable");
    expect(push.baseTease).toBeDefined();
  });

  it("has no fork when none is open, or once the answer is in", () => {
    expect(runViewFor(input({ run: legend({ startedAt: at(-2), resolvesAt: at(46) }) })).openFork).toBeNull();
    expect(runViewFor(input({ run: legend({ choices: [{ index: 0, choice: "camp", at: at(-0.5) }] }) })).openFork).toBeNull();
  });

  it("names the singing dark for a one-roster squad's next opponent", () => {
    // A Legendary route whose second checkpoint is the singing dark, one
    // leg in: the second fork is open.
    let id = 1;
    while (forksFor("legendary", { runId: id, rules: ARCHETYPE_RULES, forks: 4 })[1]?.key !== RIVAL_FORK.key) id += 1;
    const run = legend({ id, tier: "legendary", forks: 4, startedAt: at(-30), resolvesAt: at(30) });
    const view = runViewFor(input({ run, rival: "Solari Sun" }));
    expect(view.openFork).toMatchObject({ index: 1, key: RIVAL_FORK.key, rivalStory: rivalStory("Solari Sun") });
    expect(runViewFor(input({ run })).openFork!.rivalStory).toBeNull();
  });
});

describe("the journal and the clock", () => {
  it("surfaces the lines written so far, each pinned along the route", () => {
    const run = legend();
    const view = runViewFor(input({ run }));
    const written = journalFor({ ...run, tier: "legend" }, plain(), now);
    expect(view.journal.map((line) => line.text)).toEqual(written.map((entry) => entry.text));
    expect(view.journal.length).toBeGreaterThan(0);
    for (const line of view.journal) {
      expect(Date.parse(line.at)).toBeLessThanOrEqual(now.getTime());
      expect(line.fraction).toBeGreaterThanOrEqual(0);
      expect(line.fraction).toBeLessThanOrEqual(0.25);
    }
    const fractions = view.journal.map((line) => line.fraction);
    expect([...fractions].sort((a, b) => a - b)).toEqual(fractions);
  });

  it("says when it next changes: the next line due or the next fork, whichever is sooner", () => {
    const run = legend();
    const view = runViewFor(input({ run }));
    const later = journalFor({ ...run, tier: "legend" }, plain(), new Date(8.64e15)).map((entry) => entry.at.getTime()).filter((time) => time > now.getTime());
    const boundaries = forkViews(run, now).flatMap((fork) => [fork.opensAt.getTime(), fork.closesAt.getTime()]).filter((time) => time > now.getTime());
    expect(view.nextAt).toBe(new Date(Math.min(...later, ...boundaries)).toISOString());
    expect(Date.parse(view.nextAt!)).toBeGreaterThan(now.getTime());
  });

  it("stops changing once the run is brought home", () => {
    const view = runViewFor(input({ run: legend({ claimedAt: at(-0.2), startedAt: at(-50), resolvesAt: at(-2) }) }));
    expect(view.nextAt).toBeNull();
    expect(view.openFork).toBeNull();
    expect(view.road.every((place) => place.known)).toBe(true);
    expect(view.reveal).toBeNull();
  });
});

/** A Legend Hunt whose draw (without company) has `key` on leg `leg`. */
function runWith(key: string, leg: number, over: Partial<ExpeditionRun> = {}): ExpeditionRun {
  for (let id = 1; id < 5000; id += 1) {
    const run = legend({ id, ...over });
    const found = encountersFor({ ...run, tier: "legend" }).find((encounter) => encounter.leg === leg);
    if (found?.key === key) return run;
  }
  throw new Error(`no run meets a ${key} on leg ${leg}`);
}

describe("company and storms, surfaced as the journal tells them", () => {
  it("names a rival only once the squad has met them, and never a cairn with nobody at it", () => {
    const run = runWith("rival", 1);
    const company: RoadCompany = {
      rivals: [{ leg: 1, runId: 9, who: "ana-id", name: "Ana", shine: 30, theirShine: 20, won: true }],
      crossings: [
        { at: at(-3), runId: 8, who: "bo-id", name: "Bo", won: false },
        { at: at(5), runId: 7, who: "cy-id", name: "Cy", won: true },
      ],
      ghosts: [],
    };
    const before = runViewFor(input({ run: { ...run, company } }));
    expect(before.company.rivals.map((rival) => [rival.name, rival.crossing, rival.won])).toEqual([["Bo", true, false]]);
    // Twenty hours in: past the rival's hour on leg 1 (the middle of
    // 12h–24h, two hours ago), and Bo's crossing three hours ago, on the
    // same leg. In the order they happened.
    const after = runViewFor(input({ run: { ...run, company, startedAt: at(-20), resolvesAt: at(28) } }));
    expect(after.company.rivals.map((rival) => [rival.name, rival.leg, rival.crossing, rival.won])).toEqual([
      ["Bo", 1, true, false],
      ["Ana", 1, false, true],
    ]);
    // The rival's collector id and run never reach the view.
    expect(JSON.stringify(after)).not.toContain("ana-id");
    // Nobody on the road: the cairn held a cache, not a rival.
    const alone = runViewFor(input({ run: { ...run, company: { rivals: [], crossings: [], ghosts: [] }, startedAt: at(-20), resolvesAt: at(28) } }));
    expect(alone.company.rivals).toEqual([]);
  });

  it("names a ghost once it has walked beside the squad", () => {
    const run = runWith("ghost", 0);
    const company: RoadCompany = {
      rivals: [],
      crossings: [],
      ghosts: [{ leg: 0, graveId: 3, cardName: "Hal", who: "hal-owner", name: "Hana", team: null, stood: false }],
    };
    const view = runViewFor(input({ run: { ...run, company } }));
    expect(view.company.ghosts).toEqual([expect.objectContaining({ leg: 0, name: "Hal", owner: "Hana", stood: false })]);
    expect(view.company.ghosts[0].fraction).toBeCloseTo(0.125, 5);
  });

  it("draws the storm the squad sheltered from, and none for a squad that beats it", () => {
    const run = runWith("storm", 0);
    const view = runViewFor(input({ run }));
    expect(view.storms).toEqual([expect.objectContaining({ leg: 0, hours: 2 })]);
    const fast = runViewFor(input({ run, copies: [copy(1, "Top", "Speedrunner"), copy(2, "Jungle"), copy(3, "Mid")] }));
    expect(fast.storms).toEqual([]);
  });
});

describe("the reveal button", () => {
  it("is ready while there is road ahead to see, and says why when it is not", () => {
    expect(runViewFor(input()).reveal).toEqual({ state: "ready", fragments: 1, available: true, reason: null });
    expect(runViewFor(input({ fragments: 0 })).reveal).toMatchObject({ state: "short", available: false, reason: expect.stringMatching(/map fragment/) });
    expect(runViewFor(input({ reveals: { paid: true, partner: false } })).reveal).toMatchObject({ state: "paid", available: false });
    expect(runViewFor(input({ reveals: { paid: false, partner: true }, partnerName: "Rio" })).reveal).toMatchObject({ state: "partner", reason: expect.stringMatching(/^Rio revealed/) });
    const wayfarer = [copy(1, "Top", undefined, { trail: { miles: 40, runs: 12, deepest: "legendary" } }), copy(2, "Jungle"), copy(3, "Mid")];
    expect(runViewFor(input({ copies: wayfarer })).reveal).toMatchObject({ state: "known", available: false });
  });

  it("is off the card when the reveals cannot be read — and the fog stays", () => {
    const view = runViewFor(input({ reveals: null }));
    expect(view.reveal).toBeNull();
    expect(view.road.map((place) => place.known)).toEqual([true, false, false]);
  });

  it("is off the card with no road left ahead, or none at all", () => {
    // The last checkpoint is open: every place is reached.
    expect(runViewFor(input({ run: legend({ startedAt: at(-40), resolvesAt: at(8) }) })).reveal).toBeNull();
    expect(runViewFor(input({ run: legend({ tier: "exorcism", forks: 0 }) })).reveal).toBeNull();
    expect(runViewFor(input({ run: legend({ startedAt: at(-50), resolvesAt: at(-2) }) })).reveal).toBeNull();
  });
});

describe("the squad's edges", () => {
  it("count only under the edge rulebook", () => {
    const squad = [copy(1, "Top", "Camp Thief"), copy(2, "Jungle", "Camp Thief"), copy(3, "Mid", "Unkillable")];
    const sheet = abilitySheet(squad);
    expect(runViewFor(input({ copies: squad })).edges.map((edge) => edge.counts)).toEqual(sheet.map((entry) => entry.counts));
    expect(runViewFor(input({ copies: squad, run: legend({ rules: ARCHETYPE_RULES - 1 }) })).edges.every((edge) => !edge.counts)).toBe(true);
  });
});

describe("buildRunViews", () => {
  it("builds one view per run in the field, from the page's own reads", () => {
    const board = boardFixture("mid", now);
    const views = buildRunViews({ runs: board.runs, copies: board.copies, now, reveals: { mine: new Set(), partner: new Set() }, fragments: board.fragments });
    expect(Object.keys(views).map(Number).sort()).toEqual([301, 302]);
    expect(views[301].runId).toBe(301);
    expect(views[301].reveal?.state).toBe("ready");
  });

  it("shares a convoy partner's reveal, and hides the button when the reveals cannot be read", () => {
    const board = boardFixture("veteran", now);
    const shared = buildRunViews({ runs: board.runs, copies: board.copies, now, reveals: { mine: new Set(), partner: new Set([503]) }, convoys: board.convoys });
    expect(Object.keys(shared).map(Number).sort()).toEqual([501, 502]);
    expect(shared[502].reveal).toMatchObject({ state: "partner", reason: expect.stringMatching(/^Rio revealed/) });
    expect(shared[502].road.filter((place) => place.status === "pending").every((place) => place.known && place.revealedBy === "convoy")).toBe(true);
    // Another convoy's reveal is not this one's.
    const stranger = buildRunViews({ runs: board.runs, copies: board.copies, now, reveals: { mine: new Set(), partner: new Set([999]) }, convoys: board.convoys });
    expect(stranger[502].reveal?.state).not.toBe("partner");
    const unread = buildRunViews({ runs: board.runs, copies: board.copies, now, reveals: null, convoys: board.convoys });
    expect(Object.values(unread).every((view) => view.reveal === null)).toBe(true);
  });

  it("hands each run its own reveal, rival and camp", () => {
    const board = boardFixture("mid", now);
    const views = buildRunViews({
      runs: board.runs,
      copies: board.copies,
      now,
      reveals: { mine: new Set([301]), partner: new Set() },
      camp: { tent: 2 },
    });
    expect(views[301].reveal?.state).toBe("paid");
    expect(views[302].reveal?.state).not.toBe("paid");
    expect(views[301].tent).toBe(2);
  });
});
