import { describe, expect, it } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import {
  didWin,
  opponentOf,
  sameTeam,
  splitTeamFixtures,
  teamRecord,
  teamSlug,
} from "./teamPage";

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
    created_at: "2026-08-12T00:00:00Z",
    ...overrides,
  };
}

describe("teamSlug", () => {
  it("lowercases and hyphenates, dropping punctuation and edge hyphens", () => {
    expect(teamSlug("Neon Dynasty")).toBe("neon-dynasty");
    expect(teamSlug("  Void  Syndicate! ")).toBe("void-syndicate");
    expect(teamSlug("7GEN")).toBe("7gen");
  });
});

describe("sameTeam", () => {
  it("matches case-insensitively and trims, treating nulls as no match", () => {
    expect(sameTeam("Neon Dynasty", " neon dynasty ")).toBe(true);
    expect(sameTeam("Neon Dynasty", "Chrome Wolves")).toBe(false);
    expect(sameTeam(null, "Neon Dynasty")).toBe(false);
  });
});

describe("splitTeamFixtures", () => {
  const rows = [
    fixture({ id: "played-old", team_a: "Neon", team_b: "Wolves", score_a: 2, score_b: 0, scheduled_at: "2026-08-10T00:00:00Z" }),
    fixture({ id: "played-new", team_a: "Kings", team_b: "Neon", score_a: 1, score_b: 2, scheduled_at: "2026-08-17T00:00:00Z" }),
    fixture({ id: "next", team_a: "Neon", team_b: "Void", scheduled_at: "2026-08-24T00:00:00Z" }),
    fixture({ id: "tbd", team_a: "Neon", team_b: null }),
    fixture({ id: "other", team_a: "Kings", team_b: "Wolves", scheduled_at: "2026-08-24T00:00:00Z" }),
  ];

  it("keeps only this team's fixtures, upcoming soonest-first with TBD last", () => {
    const { upcoming } = splitTeamFixtures(rows, "neon");
    expect(upcoming.map((f) => f.id)).toEqual(["next", "tbd"]);
  });

  it("orders results most recent first", () => {
    const { results } = splitTeamFixtures(rows, "Neon");
    expect(results.map((f) => f.id)).toEqual(["played-new", "played-old"]);
  });
});

describe("teamRecord", () => {
  it("counts series wins and losses from either side of the fixture", () => {
    const rows = [
      fixture({ team_a: "Neon", team_b: "Wolves", score_a: 2, score_b: 0 }),
      fixture({ team_a: "Kings", team_b: "Neon", score_a: 1, score_b: 2 }),
      fixture({ team_a: "Neon", team_b: "Void", score_a: 0, score_b: 2 }),
      fixture({ team_a: "Neon", team_b: "Void" }), // unplayed
      fixture({ team_a: "Kings", team_b: "Wolves", score_a: 2, score_b: 1 }), // not ours
    ];
    expect(teamRecord(rows, "Neon")).toEqual({ wins: 2, losses: 1, seriesPlayed: 3 });
  });
});

describe("opponentOf / didWin", () => {
  it("names the other side, falling back to TBD", () => {
    expect(opponentOf(fixture({ team_a: "Neon", team_b: "Void" }), "Neon")).toBe("Void");
    expect(opponentOf(fixture({ team_a: "Kings", team_b: "Neon" }), "Neon")).toBe("Kings");
    expect(opponentOf(fixture({ team_a: "Neon", team_b: null }), "Neon")).toBe("TBD");
  });

  it("reports the result only when scores are reported", () => {
    expect(didWin(fixture({ team_a: "Neon", team_b: "Void", score_a: 2, score_b: 1 }), "Neon")).toBe(true);
    expect(didWin(fixture({ team_a: "Neon", team_b: "Void", score_a: 0, score_b: 2 }), "Neon")).toBe(false);
    expect(didWin(fixture({ team_a: "Neon", team_b: "Void" }), "Neon")).toBeNull();
  });
});
