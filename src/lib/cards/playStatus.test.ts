import { describe, expect, it } from "vitest";
import { playStatuses } from "./playStatus";
import type { ExpeditionRun } from "@/lib/expeditions/queries";

// A Wednesday, so the editable fantasy week is the following Monday.
const now = new Date("2026-08-26T15:00:00Z");

function run(overrides: Partial<ExpeditionRun>): ExpeditionRun {
  return {
    id: 1,
    tier: "raid",
    squad: [1, 2, 3],
    shine: 0,
    startedAt: "2026-08-26T12:00:00Z",
    resolvesAt: "2026-08-26T18:00:00Z",
    outcome: null,
    claimedAt: null,
    ...overrides,
  } as ExpeditionRun;
}

const quiet = { now, fantasyLineupIn: false, gauntlet: null, showdown: null, expeditions: [], copies: 0 };

describe("playStatuses", () => {
  it("says whether the lineup is in, and when the week locks, on the league's clock", () => {
    expect(playStatuses({ ...quiet, fantasyLineupIn: false }).fantasy).toEqual({
      text: "No WK Aug 31 lineup yet · locks Mon 6:00 PM",
      tone: "open",
    });
    expect(playStatuses({ ...quiet, fantasyLineupIn: true }).fantasy?.tone).toBe("done");
    expect(playStatuses({ ...quiet, fantasyLineupIn: null }).fantasy?.text).toBe("WK Aug 31 lineups lock Mon 6:00 PM");
  });

  it("leaves the Gauntlet out where there is no Gauntlet", () => {
    expect(playStatuses(quiet).gauntlet).toBeUndefined();
  });

  it("reports a run in progress before a best score", () => {
    expect(playStatuses({ ...quiet, gauntlet: { active: true, bestScore: 900, attempts: 2 } }).gauntlet?.tone).toBe("open");
    expect(playStatuses({ ...quiet, gauntlet: { active: false, bestScore: 900, attempts: 2 } }).gauntlet?.text).toBe(
      "Best this week 900 · 2 runs",
    );
    expect(playStatuses({ ...quiet, gauntlet: { active: false, bestScore: 0, attempts: 0 } }).gauntlet?.tone).toBe("quiet");
  });

  it("puts a squad waiting to be collected ahead of one still out", () => {
    const back = run({ id: 1, outcome: { grade: "solid", dollars: 100, comp: false, mark: null, bearer: null } });
    const out = run({ id: 2, resolvesAt: "2026-08-26T20:30:00Z" });
    expect(playStatuses({ ...quiet, expeditions: [out, back] }).expeditions).toEqual({
      text: "A squad is back — collect what they brought",
      tone: "waiting",
    });
    expect(playStatuses({ ...quiet, expeditions: [out] }).expeditions?.text).toBe("A squad is out · back Wed 4:30 PM");
    // Collected runs are history, not status.
    expect(playStatuses({ ...quiet, expeditions: [run({ ...back, claimedAt: "2026-08-26T14:00:00Z" })] }).expeditions?.tone).toBe("quiet");
  });

  it("reports a seat, then open tables, then the rules, and nothing where there is no Showdown", () => {
    expect(playStatuses({ ...quiet, showdown: { seated: true, openTables: 3 } }).showdown?.tone).toBe("open");
    expect(playStatuses({ ...quiet, showdown: { seated: false, openTables: 1 } }).showdown?.text).toBe("1 table dealing now");
    expect(playStatuses({ ...quiet, showdown: { seated: false, openTables: 0 } }).showdown).toEqual({
      text: "Tables open soon — read the rules",
      tone: "quiet",
    });
    expect(playStatuses(quiet).showdown).toBeUndefined();
  });

  it("counts every copy as a ticket", () => {
    expect(playStatuses({ ...quiet, copies: 1 }).draw?.text).toBe("1 ticket in Tuesday's draw");
    expect(playStatuses({ ...quiet, copies: 0 }).draw?.tone).toBe("quiet");
  });
});
