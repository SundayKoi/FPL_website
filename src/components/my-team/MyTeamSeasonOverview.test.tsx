import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it } from "vitest";
import type { FixtureRow } from "@/lib/schedule/types";
import { MyTeamSeasonOverview } from "./MyTeamSeasonOverview";

function fixture(overrides: Partial<FixtureRow> = {}): FixtureRow {
  return {
    id: "fixture", season: "S5", stage: "week_1", division: "Solari", team_a: "Meridian", team_b: "Other",
    scheduled_at: "2026-09-01T00:00:00Z", best_of: 3, score_a: null, score_b: null, sort_order: 1,
    created_at: "2026-08-01T00:00:00Z", ...overrides,
  };
}

afterEach(cleanup);

describe("MyTeamSeasonOverview", () => {
  it("sorts upcoming and recent series, and limits recent form to three", () => {
    const fixtures = [
      fixture({ id: "upcoming-later", scheduled_at: "2026-09-10T00:00:00Z", team_b: "Later" }),
      fixture({ id: "recent-old", scheduled_at: "2026-08-01T00:00:00Z", score_a: 0, score_b: 2, team_b: "Old" }),
      fixture({ id: "recent-new", scheduled_at: "2026-09-02T00:00:00Z", score_a: 2, score_b: 1, team_b: "New" }),
      fixture({ id: "recent-mid", scheduled_at: "2026-08-20T00:00:00Z", score_a: 1, score_b: 1, team_b: "Mid" }),
      fixture({ id: "recent-three", scheduled_at: "2026-08-15T00:00:00Z", score_a: 2, score_b: 0, team_b: "Three" }),
      fixture({ id: "recent-four", scheduled_at: "2026-08-10T00:00:00Z", score_a: 2, score_b: 0, team_b: "Four" }),
      fixture({ id: "upcoming-first", scheduled_at: "2026-09-03T00:00:00Z", team_b: "Soon" }),
    ];
    render(<MyTeamSeasonOverview teamName="Meridian" fixtures={fixtures} />);

    const upcoming = screen.getByRole("region", { name: "What comes next" });
    expect(upcoming.textContent?.indexOf("Soon")).toBeLessThan(upcoming.textContent?.indexOf("Later") ?? 0);
    const recent = screen.getByRole("region", { name: "Recent form" });
    expect(recent.textContent).toContain("New");
    expect(recent.textContent).toContain("Mid");
    expect(recent.textContent).toContain("Three");
    expect(recent.textContent).not.toContain("Four");
    expect(recent.textContent).not.toContain("Old");
  });

  it("keeps both headings and explains empty halves", () => {
    render(<MyTeamSeasonOverview teamName="Meridian" fixtures={[]} />);

    expect(screen.getByRole("region", { name: "What comes next" })).toBeTruthy();
    expect(screen.getByRole("region", { name: "Recent form" })).toBeTruthy();
    expect(screen.getByText(/no upcoming matches scheduled/i)).toBeTruthy();
    expect(screen.getByText(/no results posted yet/i)).toBeTruthy();
  });
});
