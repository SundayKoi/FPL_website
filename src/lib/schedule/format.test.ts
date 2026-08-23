import { describe, expect, it } from "vitest";
import { etInputToIso, isoToEtInput } from "@/components/schedule/AdminFixturesEditor";
import { countdownLabel } from "@/components/schedule/UpNextBanner";
import {
  STAGE_META,
  formatKickoff,
  groupByStage,
  hasResult,
  nextUp,
  resolveSeason,
  selectDefaultOpenStages,
  selectActiveRegularSeasonStage,
  seasonsOf,
  stageMeta,
  teamLabel,
} from "./format";
import { FIXTURE_STAGES, type FixtureRow } from "./types";

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: crypto.randomUUID(),
    season: "S5",
    stage: "week_1",
    division: null,
    team_a: null,
    team_b: null,
    scheduled_at: null,
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 0,
    created_at: "2026-08-11T00:00:00Z",
    ...overrides,
  };
}

describe("STAGE_META", () => {
  it("covers every fixture stage exactly once, in rulebook order", () => {
    expect(STAGE_META.map((m) => m.stage)).toEqual([...FIXTURE_STAGES]);
  });

  it("assigns the rulebook series lengths per stage", () => {
    expect(stageMeta("week_3").bestOf).toBe(3);
    expect(stageMeta("gauntlet_r1").bestOf).toBe(1);
    expect(stageMeta("gauntlet_r2").bestOf).toBe(1);
    expect(stageMeta("quarterfinals").bestOf).toBe(5);
    expect(stageMeta("finals").bestOf).toBe(5);
  });
});

describe("groupByStage", () => {
  it("emits every stage even with no fixtures, so the page shows the full split", () => {
    const groups = groupByStage([]);
    expect(groups).toHaveLength(FIXTURE_STAGES.length);
    expect(groups.every((g) => g.fixtures.length === 0)).toBe(true);
  });

  it("orders within a stage by sort_order, then Solari before Lunari, nulls last", () => {
    const rows = [
      fixture({ id: "cross", stage: "week_1", division: null, sort_order: 1 }),
      fixture({ id: "lunari", stage: "week_1", division: "Lunari", sort_order: 1 }),
      fixture({ id: "solari", stage: "week_1", division: "Solari", sort_order: 1 }),
      fixture({ id: "first", stage: "week_1", division: "Lunari", sort_order: 0 }),
    ];
    const week1 = groupByStage(rows)[0];
    expect(week1.meta.stage).toBe("week_1");
    expect(week1.fixtures.map((f) => f.id)).toEqual(["first", "solari", "lunari", "cross"]);
  });

  it("buckets fixtures into their own stages", () => {
    const rows = [fixture({ stage: "finals" }), fixture({ stage: "week_2" })];
    const groups = groupByStage(rows);
    const byStage = Object.fromEntries(groups.map((g) => [g.meta.stage, g.fixtures.length]));
    expect(byStage.week_2).toBe(1);
    expect(byStage.finals).toBe(1);
    expect(byStage.week_1).toBe(0);
  });
});

describe("formatKickoff", () => {
  it("renders null and invalid dates as TBD", () => {
    expect(formatKickoff(null)).toBe("Date TBD");
    expect(formatKickoff("not-a-date")).toBe("Date TBD");
  });

  it("pins to Eastern time with an ET suffix", () => {
    // 2026-08-17 is a Monday; 8pm EDT == 2026-08-18T00:00Z.
    const text = formatKickoff("2026-08-18T00:00:00Z");
    expect(text).toContain("Mon");
    expect(text).toContain("8:00");
    expect(text).toMatch(/ET$/);
  });
});

describe("teamLabel / hasResult", () => {
  it("falls back to TBD for null or blank names", () => {
    expect(teamLabel(null)).toBe("TBD");
    expect(teamLabel("   ")).toBe("TBD");
    expect(teamLabel("Neon Dynasty")).toBe("Neon Dynasty");
  });

  it("only reports a result when both scores are present", () => {
    expect(hasResult(fixture({}))).toBe(false);
    expect(hasResult(fixture({ score_a: 2, score_b: 1 }))).toBe(true);
  });
});

describe("seasonsOf / resolveSeason", () => {
  const rows = [
    fixture({ season: "S4" }),
    fixture({ season: "S5" }),
    fixture({ season: "S5" }),
    fixture({ season: "S10" }),
  ];

  it("lists distinct seasons newest first, numeric-aware", () => {
    expect(seasonsOf(rows)).toEqual(["S10", "S5", "S4"]);
  });

  it("resolves the requested season when it exists", () => {
    expect(resolveSeason(rows, "S4")).toBe("S4");
  });

  it("falls back to the newest season for stale or missing params", () => {
    expect(resolveSeason(rows, "S99")).toBe("S10");
    expect(resolveSeason(rows, undefined)).toBe("S10");
  });

  it("returns null when there are no fixtures", () => {
    expect(resolveSeason([], "S5")).toBeNull();
  });
});

describe("selectActiveRegularSeasonStage", () => {
  it("keeps an incomplete Week 1 active", () => {
    expect(selectActiveRegularSeasonStage([fixture({ stage: "week_1" })])).toBe("week_1");
  });

  it("advances from a completed Week 1 to Week 2", () => {
    expect(
      selectActiveRegularSeasonStage([fixture({ stage: "week_1", score_a: 2, score_b: 1 })]),
    ).toBe("week_2");
  });

  it("does not skip an empty Week 2 when a later week has fixtures", () => {
    expect(
      selectActiveRegularSeasonStage([
        fixture({ stage: "week_1", score_a: 2, score_b: 1 }),
        fixture({ stage: "week_3" }),
      ]),
    ).toBe("week_2");
  });

  it("returns null after every regular-season week is complete", () => {
    const rows = (["week_1", "week_2", "week_3", "week_4", "week_5"] as const).map((stage) =>
      fixture({ stage, score_a: 2, score_b: 1 }),
    );
    expect(selectActiveRegularSeasonStage(rows)).toBeNull();
  });
});

describe("selectDefaultOpenStages", () => {
  it("opens the latest played stage and the upcoming stage", () => {
    const rows = [
      fixture({ stage: "week_1", score_a: 2, score_b: 1 }),
      fixture({ stage: "week_2", score_a: 2, score_b: 0 }),
      fixture({ stage: "week_3" }),
    ];

    expect([...selectDefaultOpenStages(rows, "week_3")]).toEqual(["week_2", "week_3"]);
  });

  it("opens only the latest played stage when there is no upcoming stage", () => {
    const rows = [
      fixture({ stage: "week_1", score_a: 2, score_b: 1 }),
      fixture({ stage: "week_2", score_a: 2, score_b: 0 }),
    ];

    expect([...selectDefaultOpenStages(rows, null)]).toEqual(["week_2"]);
  });
});

describe("countdownLabel", () => {
  const now = Date.parse("2026-08-20T00:00:00Z");
  it("renders days+hours, hours+minutes, minutes, and live states", () => {
    expect(countdownLabel(Date.parse("2026-08-23T05:30:00Z"), now)).toBe("in 3d 5h");
    expect(countdownLabel(Date.parse("2026-08-20T02:15:00Z"), now)).toBe("in 2h 15m");
    expect(countdownLabel(Date.parse("2026-08-20T00:40:00Z"), now)).toBe("in 40m");
    expect(countdownLabel(Date.parse("2026-08-19T23:00:00Z"), now)).toBe("live now");
  });
});

describe("nextUp", () => {
  const now = new Date("2026-08-20T00:00:00Z");

  it("picks the earliest future-dated unplayed fixture's stage with its series count", () => {
    const rows = [
      fixture({ stage: "week_1", score_a: 2, score_b: 0, scheduled_at: "2026-08-18T00:00:00Z" }),
      fixture({ stage: "week_2", scheduled_at: "2026-08-25T00:00:00Z" }),
      fixture({ stage: "week_2", scheduled_at: "2026-08-25T00:00:00Z" }),
      fixture({ stage: "week_3", scheduled_at: "2026-09-01T00:00:00Z" }),
    ];
    expect(nextUp(rows, now)).toEqual({
      stage: "week_2",
      kickoff: "2026-08-25T00:00:00Z",
      count: 2,
    });
  });

  it("ignores past-dated fixtures and falls back to the active undated week", () => {
    const rows = [
      fixture({ stage: "week_1", score_a: 2, score_b: 1, scheduled_at: "2026-08-18T00:00:00Z" }),
      fixture({ stage: "week_2" }),
    ];
    expect(nextUp(rows, now)).toEqual({ stage: "week_2", kickoff: null, count: 1 });
  });

  it("returns null when every regular-season week is complete and nothing is dated", () => {
    const rows = (["week_1", "week_2", "week_3", "week_4", "week_5"] as const).map((stage) =>
      fixture({ stage, score_a: 2, score_b: 0 }),
    );
    expect(nextUp(rows, now)).toBeNull();
  });
});

describe("ET datetime conversion", () => {
  it("round-trips a summer (EDT) wall-clock", () => {
    const iso = etInputToIso("2026-08-17T20:00");
    // 8pm EDT is UTC-4.
    expect(iso).toBe("2026-08-18T00:00:00.000Z");
    expect(isoToEtInput(iso)).toBe("2026-08-17T20:00");
  });

  it("round-trips a winter (EST) wall-clock", () => {
    const iso = etInputToIso("2026-01-12T20:00");
    // 8pm EST is UTC-5.
    expect(iso).toBe("2026-01-13T01:00:00.000Z");
    expect(isoToEtInput(iso)).toBe("2026-01-12T20:00");
  });

  it("returns null/empty for blank input", () => {
    expect(etInputToIso("")).toBeNull();
    expect(isoToEtInput(null)).toBe("");
  });
});
