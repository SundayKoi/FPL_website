import { describe, expect, it } from "vitest";
import { filterAcademyFixtures } from "./filtering";

const fixture = (team_a: string, team_b: string) => ({ team_a, team_b }) as never;

describe("Academy filters", () => {
  it("excludes fixtures without an Academy team", () => {
    expect(filterAcademyFixtures([fixture("Academy A", "Premier B"), fixture("Premier A", "Premier B")], new Set(["academy a"]))).toHaveLength(1);
  });
});
