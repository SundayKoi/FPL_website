import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "./build";
import { buildTeamCards, DEFAULT_TEAM_COLOR, TEAM_ROLES } from "./teamCards";

function card(over: Partial<PlayerCardData> = {}): PlayerCardData {
  return {
    slug: `${over.name ?? "player"}-na1`.toLowerCase(),
    name: "Player",
    tag: "NA1",
    teamName: "Faceless",
    teamImageUrl: null,
    role: "Mid",
    overall: 70,
    signature: { champion: "Ahri", games: 9 },
    standout: false,
    subStats: [],
    ...over,
  } as unknown as PlayerCardData;
}

describe("buildTeamCards", () => {
  it("fills one panel per role with that role's best card and its champion", () => {
    const team = buildTeamCards([
      card({ name: "Top1", role: "Top", overall: 71, signature: { champion: "Aatrox", games: 8 } }),
      card({ name: "Jg1", role: "Jungle", overall: 76, signature: { champion: "Xin Zhao", games: 12 } }),
      card({ name: "MidLow", role: "Mid", overall: 62, signature: { champion: "Zed", games: 3 } }),
      card({ name: "MidTop", role: "Mid", overall: 84, signature: { champion: "Ahri", games: 15 } }),
      card({ name: "Bot1", role: "Bot", overall: 80, signature: { champion: "Kai'Sa", games: 20 } }),
      card({ name: "Sup1", role: "Support", overall: 66, signature: { champion: "Thresh", games: 9 } }),
    ])[0];

    expect(team.slots.map((slot) => slot.role)).toEqual([...TEAM_ROLES]);
    // The better of two mids takes the panel.
    expect(team.slots.find((slot) => slot.role === "Mid")).toMatchObject({ name: "MidTop", champion: "Ahri" });
    expect(team.slots.find((slot) => slot.role === "Bot")?.champion).toBe("Kai'Sa");
  });

  it("prints an empty panel for a role nobody covers rather than borrowing one", () => {
    // A team card that quietly plays a mid in the support panel is lying
    // about the roster.
    const team = buildTeamCards([
      card({ name: "Mid1", role: "Mid", overall: 80 }),
      card({ name: "Mid2", role: "Mid", overall: 78 }),
    ])[0];

    const support = team.slots.find((slot) => slot.role === "Support")!;
    expect(support.name).toBe("—");
    expect(support.champion).toBeNull();
    expect(support.slug).toBeNull();
    // ...and no card is used twice.
    const named = team.slots.filter((slot) => slot.slug).map((slot) => slot.slug);
    expect(new Set(named).size).toBe(named.length);
  });

  it("rates a roster on its five best, so a sub can't drag it down", () => {
    const strong = Array.from({ length: 5 }, (_, index) =>
      card({ name: `Star${index}`, role: TEAM_ROLES[index], overall: 90 }),
    );
    const withSub = buildTeamCards([...strong, card({ name: "Sub", role: "Top", overall: 40 })])[0];
    expect(withSub.overall).toBe(90);
  });

  it("takes the team's banner colour, and falls back rather than going grey", () => {
    const colors = new Map([["faceless", "#c8102e"]]);
    expect(buildTeamCards([card()], colors)[0].bannerColor).toBe("#c8102e");
    // Punctuation and case in the team name still find the colour.
    expect(buildTeamCards([card({ teamName: "The Faceless!" })], new Map([["thefaceless", "#123456"]]))[0].bannerColor)
      .toBe("#123456");
    expect(buildTeamCards([card()])[0].bannerColor).toBe(DEFAULT_TEAM_COLOR);
  });

  it("skips teamless cards and sorts the strongest roster first", () => {
    const teams = buildTeamCards([
      card({ name: "A", teamName: "Alpha", overall: 60 }),
      card({ name: "B", teamName: "Beta", overall: 90 }),
      card({ name: "Nobody", teamName: null }),
    ]);
    expect(teams.map((team) => team.teamName)).toEqual(["Beta", "Alpha"]);
    expect(teams.every((team) => team.teamName)).toBe(true);
  });

  it("carries the monogram and the Card of the Week star", () => {
    const team = buildTeamCards([
      card({ name: "Star", role: "Mid", teamName: "Iron Wolves Gaming", standout: true }),
    ])[0];
    expect(team.monogram).toBe("IWG");
    expect(team.slots.find((slot) => slot.role === "Mid")?.standout).toBe(true);
  });
});
