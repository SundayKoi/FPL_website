import { describe, expect, it } from "vitest";
import { filterStatsRowsByPlayerKeys, filterTimelineRowsByTeams } from "./scope";

describe("Academy stats scope", () => {
  it("filters player aggregate rows by identities from Academy games", () => {
    expect(filterStatsRowsByPlayerKeys([
      { summoner_name: "Academy", tag: "1" },
      { summoner_name: "Premier", tag: "1" },
    ] as never, new Set(["academy#1"]))).toHaveLength(1);
  });

  it("filters timeline rows to Academy team sides", () => {
    expect(filterTimelineRowsByTeams([
      { blue_team: "Academy", red_team: "Premier" },
      { blue_team: "Premier", red_team: "Premier2" },
    ] as never, new Set(["academy"]))).toHaveLength(1);
  });
});
