import { describe, expect, it } from "vitest";
import { buildTickerItems } from "./ticker";
import type { HomepageAwardsData } from "./awards";
import type { FixtureRow } from "@/lib/schedule/types";

function fixture(overrides: Partial<FixtureRow>): FixtureRow {
  return {
    id: "fx-1",
    season: "S5",
    stage: "week_1",
    division: "Solari",
    team_a: "Alpha",
    team_b: "Bravo",
    scheduled_at: null,
    best_of: 3,
    score_a: null,
    score_b: null,
    sort_order: 1,
    created_at: "2026-08-01T00:00:00Z",
    ...overrides,
  };
}

const award = (title: string, name: string | null, value: string) => ({
  title,
  name,
  tag: null,
  teamName: null,
  detail: "",
  value,
});

const awards: HomepageAwardsData = {
  season: "S5",
  periodLabel: "Week of Aug 17",
  playerOfWeek: award("Player of the Week", "Ace", "87.3"),
  teamOfWeek: award("Team of the Week", null, "2–0"),
  individualAwards: [award("Biggest Riser", "Momo", "+12.4")],
  teamAwards: [],
};

const leader = {
  id: "team-1",
  name: "Alpha",
  abbreviation: "AL",
  nomination_position: 1,
  wins: 3,
  losses: 1,
};

describe("buildTickerItems", () => {
  it("orders live, finals, up-next, leader, and award headliners", () => {
    const items = buildTickerItems({
      live: true,
      fixtures: [
        fixture({ id: "done", score_a: 2, score_b: 1 }),
        fixture({ id: "soon", team_a: "Charlie", team_b: "Delta" }),
      ],
      standings: [leader],
      awards,
    });

    expect(items.map((item) => item.key)).toEqual(["live", "final-done", "next-soon", "leader", "potw", "riser"]);
    expect(items.find((item) => item.key === "final-done")?.text).toBe("Alpha 2–1 Bravo");
    expect(items.find((item) => item.key === "leader")?.text).toBe("Alpha 3–1");
    expect(items.find((item) => item.key === "potw")?.text).toBe("Ace · 87.3 power");
  });

  it("skips sections without data instead of rendering placeholders", () => {
    const items = buildTickerItems({
      live: false,
      fixtures: [],
      standings: [{ ...leader, wins: 0, losses: 0 }],
      awards: {
        ...awards,
        playerOfWeek: award("Player of the Week", null, "—"),
        individualAwards: [],
      },
    });

    expect(items).toEqual([]);
  });
});
