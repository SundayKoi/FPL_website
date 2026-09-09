import { describe, expect, it } from "vitest";
import { encountersFor, type Encounter } from "./journal";
import { COMPANY_RULES } from "./routes";
import { companyFor, ghostFor, rivalFor, rivalVerdict, tallyRivalries, type GraveCandidate, type RunCandidate } from "./company";

const HOUR = 60 * 60 * 1000;
const T0 = Date.parse("2026-09-04T00:00:00Z");
const iso = (ms: number) => new Date(ms).toISOString();

const run = (over: Partial<RunCandidate> & { id: number }): RunCandidate => ({
  discordId: `user-${over.id}`,
  tier: "raid",
  shine: 12,
  startedAt: iso(T0),
  resolvesAt: iso(T0 + 24 * HOUR),
  forks: 2,
  rules: COMPANY_RULES,
  convoy: null,
  ...over,
});

const encountersOf = (candidate: RunCandidate) =>
  encountersFor({ id: candidate.id, tier: candidate.tier as "raid", startedAt: candidate.startedAt, resolvesAt: candidate.resolvesAt, forks: candidate.forks, rules: candidate.rules, convoy: candidate.convoy });

/** A raid whose road carries a rival on some leg, and the leg. */
function raidWithRival(from = 1): { mine: RunCandidate; encounter: Encounter } {
  for (let id = from; id < 2000; id += 1) {
    const mine = run({ id });
    const encounter = encountersOf(mine).find((entry) => entry.key === "rival");
    if (encounter) return { mine, encounter };
  }
  throw new Error("no raid meets a rival");
}

describe("who the rival is", () => {
  it("is the other collector's run on the same route launched closest before the hour, within a day", () => {
    const mine = run({ id: 1 });
    const at = new Date(T0 + 12 * HOUR);
    const earlier = run({ id: 2, startedAt: iso(T0 + 2 * HOUR) });
    const closest = run({ id: 3, startedAt: iso(T0 + 10 * HOUR) });
    const after = run({ id: 4, startedAt: iso(T0 + 13 * HOUR) });
    const stale = run({ id: 5, startedAt: iso(T0 - 13 * HOUR) });
    const otherRoute = run({ id: 6, tier: "legend", startedAt: iso(T0 + 11 * HOUR) });
    const myOwn = run({ id: 7, discordId: "user-1", startedAt: iso(T0 + 11 * HOUR) });
    expect(rivalFor(mine, at, [mine, earlier, closest, after, stale, otherRoute, myOwn])?.id).toBe(3);
    // Nobody on the road.
    expect(rivalFor(mine, at, [mine, after, stale, otherRoute])).toBeNull();
  });

  it("is never the convoy partner", () => {
    const mine = run({ id: 1, convoy: 9 });
    const partner = run({ id: 2, convoy: 9, startedAt: iso(T0) });
    const stranger = run({ id: 3, startedAt: iso(T0 - HOUR) });
    expect(rivalFor(mine, new Date(T0 + 12 * HOUR), [mine, partner, stranger])?.id).toBe(3);
  });

  it("gives the spot to the squad with more shine, and the coin only a tie", () => {
    expect(rivalVerdict(14, 12, false)).toBe(true);
    expect(rivalVerdict(12, 14, true)).toBe(false);
    expect(rivalVerdict(12, 12, true)).toBe(true);
    expect(rivalVerdict(12, 12, false)).toBe(false);
  });
});

describe("the company of a run", () => {
  it("names the rival by username, decides by shine, and records the coin's tie-break", () => {
    const { mine, encounter } = raidWithRival();
    const at = encounter.at.getTime();
    const weaker = run({ id: 9001, discordId: "them", shine: 10, startedAt: iso(at - HOUR) });
    const names = new Map([["them", "Doug"]]);
    const company = companyFor({ mine, encounters: encountersOf(mine), others: [weaker], graves: [], names, squadTeams: [], encountersOf });
    expect(company.rivals).toEqual([{ leg: encounter.leg, runId: 9001, who: "them", name: "Doug", shine: 12, theirShine: 10, won: true }]);
    const stronger = run({ id: 9002, discordId: "them", shine: 20, startedAt: iso(at - HOUR) });
    expect(companyFor({ mine, encounters: encountersOf(mine), others: [stronger], graves: [], names, squadTeams: [], encountersOf }).rivals[0].won).toBe(false);
    const level = run({ id: 9003, discordId: "them", shine: 12, startedAt: iso(at - HOUR) });
    expect(companyFor({ mine, encounters: encountersOf(mine), others: [level], graves: [], names, squadTeams: [], encountersOf }).rivals[0].won).toBe(encounter.won);
  });

  it("meets nobody on an empty road, and nobody at all below the company rulebook", () => {
    const { mine } = raidWithRival();
    expect(companyFor({ mine, encounters: encountersOf(mine), others: [], graves: [], names: new Map(), squadTeams: [], encountersOf }).rivals).toEqual([]);
    const old = { ...mine, rules: COMPANY_RULES - 1 };
    const rival = run({ id: 9001, discordId: "them", startedAt: iso(T0 - HOUR) });
    expect(companyFor({ mine: old, encounters: encountersOf(mine), others: [rival], graves: [], names: new Map(), squadTeams: [], encountersOf })).toEqual({ rivals: [], crossings: [], ghosts: [] });
  });

  it("writes the other side of a meet as a crossing, with this run's verdict", () => {
    // THEIR run meets a rival; mine launched just before the hour, so I am it.
    const { mine: theirs, encounter } = raidWithRival();
    const them = { ...theirs, discordId: "them", shine: 10 };
    const mine = run({ id: 9001, discordId: "me", shine: 12, startedAt: iso(encounter.at.getTime() - HOUR) });
    const company = companyFor({ mine, encounters: encountersOf(mine), others: [them], graves: [], names: new Map([["them", "Doug"]]), squadTeams: [], encountersOf });
    const crossing = company.crossings.find((entry) => entry.runId === them.id);
    expect(crossing).toEqual({ at: encounter.at.toISOString(), runId: them.id, who: "them", name: "Doug", won: true });
    // A stronger squad on their side: they took the spot.
    const strong = { ...them, shine: 20 };
    expect(companyFor({ mine, encounters: encountersOf(mine), others: [strong], graves: [], names: new Map(), squadTeams: [], encountersOf }).crossings.find((entry) => entry.runId === them.id)?.won).toBe(false);
  });
});

describe("the ghosts", () => {
  const graves: GraveCandidate[] = [
    { id: 1, discordId: "doug", playerName: "Faker", team: "T1", diedAt: iso(T0 - 48 * HOUR) },
    { id: 2, discordId: "ann", playerName: "Chovy", team: "GEN", diedAt: iso(T0 - 24 * HOUR) },
    // Dug after every hour these tests read: never a ghost here.
    { id: 3, discordId: "ann", playerName: "Ruler", team: "JDG", diedAt: iso(T0 + 100 * HOUR) },
  ];

  it("picks a grave dug before the hour, the same one every time", () => {
    const at = new Date(T0 + 12 * HOUR);
    const first = ghostFor(7, 1, at, graves);
    expect(first).not.toBeNull();
    expect(first!.id).not.toBe(3);
    expect(ghostFor(7, 1, at, graves)).toEqual(first);
    // Nobody dead yet: no ghost.
    expect(ghostFor(7, 1, new Date(T0 - 72 * HOUR), graves)).toBeNull();
    // Different runs draw different graves over enough tries.
    const drawn = new Set(Array.from({ length: 40 }, (_, index) => ghostFor(index + 1, 0, at, graves)!.id));
    expect(drawn.size).toBe(2);
  });

  it("walks the Legend and Legendary roads by name, and stands aside for its old colours", () => {
    let found: { mine: RunCandidate; leg: number } | null = null;
    for (let id = 1; id < 3000 && !found; id += 1) {
      const mine = run({ id, tier: "legendary", forks: 4, resolvesAt: iso(T0 + 72 * HOUR) });
      const ghost = encountersOf(mine).find((entry) => entry.key === "ghost");
      if (ghost) found = { mine, leg: ghost.leg };
    }
    expect(found).not.toBeNull();
    const names = new Map([["doug", "Doug"], ["ann", "Ann"]]);
    const met = companyFor({ mine: found!.mine, encounters: encountersOf(found!.mine), others: [], graves, names, squadTeams: ["DK"], encountersOf });
    expect(met.ghosts).toHaveLength(1);
    expect(met.ghosts[0]).toMatchObject({ leg: found!.leg, stood: false });
    expect(["Faker", "Chovy"]).toContain(met.ghosts[0].cardName);
    expect(["Doug", "Ann"]).toContain(met.ghosts[0].name);
    const colours = companyFor({ mine: found!.mine, encounters: encountersOf(found!.mine), others: [], graves, names, squadTeams: ["T1", "GEN"], encountersOf });
    expect(colours.ghosts[0].stood).toBe(true);
    // A raid never draws a ghost.
    const raids = Array.from({ length: 300 }, (_, index) => run({ id: index + 1 }));
    expect(raids.flatMap(encountersOf).some((entry) => entry.key === "ghost")).toBe(false);
    // Nor does a Legendary run from before the rule.
    const old = Array.from({ length: 300 }, (_, index) => run({ id: index + 1, tier: "legendary", forks: 4, rules: COMPANY_RULES - 1 }));
    expect(old.flatMap(encountersOf).some((entry) => entry.key === "ghost")).toBe(false);
  });
});

describe("the season's rivalries", () => {
  it("scores both sides of every meet, newest first", () => {
    const records = [
      { owner: "me", claimedAt: "2026-09-01T00:00:00Z", rivals: [{ who: "doug", name: "Doug", runId: 1, won: true }] },
      { owner: "doug", claimedAt: "2026-09-03T00:00:00Z", rivals: [{ who: "me", name: "Me", runId: 2, won: true }] },
      { owner: "ann", claimedAt: "2026-09-02T00:00:00Z", rivals: [{ who: "me", name: "Me", runId: 3, won: false }, { who: "doug", name: "Doug", runId: 3, won: true }] },
      { owner: "doug", claimedAt: "2026-09-04T00:00:00Z", rivals: [{ who: "ann", name: "Ann", runId: 4, won: true }] },
    ];
    const names = new Map([["doug", "Doug"], ["ann", "Ann"]]);
    expect(tallyRivalries("me", records, names)).toEqual([
      { who: "doug", name: "Doug", beaten: 1, beatenBy: 1, last: "2026-09-03T00:00:00Z" },
      { who: "ann", name: "Ann", beaten: 1, beatenBy: 0, last: "2026-09-02T00:00:00Z" },
    ]);
    expect(tallyRivalries("me", [], names)).toEqual([]);
  });
});
