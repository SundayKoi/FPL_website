import { describe, expect, it } from "vitest";
import { filterAcademyFixtures } from "./filtering";

const fixture = (team_a: string, team_b: string, stage = "week_1") =>
  ({ team_a, team_b, stage }) as never;

describe("Academy filters", () => {
  it("excludes fixtures without an Academy team", () => {
    expect(filterAcademyFixtures([fixture("Academy A", "Premier B"), fixture("Premier A", "Premier B")], new Set(["academy a"]))).toHaveLength(1);
  });

  it("excludes gauntlet rounds — Academy plays regular season into playoffs", () => {
    const rows = [
      fixture("Academy A", "Academy B", "week_1"),
      fixture("Academy A", "Academy B", "gauntlet_r1"),
      fixture("Academy A", "Academy B", "gauntlet_r2"),
      fixture("Academy A", "Academy B", "quarterfinals"),
    ];
    expect(
      filterAcademyFixtures(rows, new Set(["academy a", "academy b"])).map(
        (row) => (row as { stage: string }).stage,
      ),
    ).toEqual(["week_1", "quarterfinals"]);
  });
});
