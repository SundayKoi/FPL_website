import { describe, expect, it } from "vitest";
import { leagueNavigationLinks } from "./navigation";

describe("league navigation links", () => {
  it("returns direct Academy header destinations", () => {
    expect(leagueNavigationLinks("academy")).toEqual([
      { label: "Players", href: "/academy/players" },
      { label: "Teams", href: "/academy/teams" },
      { label: "Schedule", href: "/academy/schedule" },
      { label: "Stats", href: "/academy/stats" },
      { label: "My Team", href: "/academy/my-team" },
    ]);
  });
});
