import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "./build";
import {
  buildTeamCards,
  DEFAULT_TEAM_COLOR,
  TEAM_DUST,
  TEAM_ROLES,
  TEAM_TIER,
  teamCardSlug,
  teamToCard,
} from "./teamCards";

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

  it("carries each player's autograph onto their own panel", () => {
    const team = buildTeamCards([
      card({ name: "Inked", role: "Mid", autograph: "data:image/png;base64,AAA" }),
      card({ name: "Plain", role: "Bot" }),
    ])[0];
    expect(team.slots.find((slot) => slot.role === "Mid")?.autograph).toBe("data:image/png;base64,AAA");
    expect(team.slots.find((slot) => slot.role === "Bot")?.autograph).toBeNull();
    expect(team.slots.find((slot) => slot.role === "Support")?.autograph).toBeNull();
  });

  it("takes the team's tag off its own cards, and falls back to initials", () => {
    // The plate prints the tag, not the name — "Iron Wolves Gaming" is
    // three words too many for five panels and truncates to nonsense.
    const tagged = buildTeamCards([
      card({ name: "Star", role: "Mid", teamName: "Iron Wolves Gaming", teamAbbr: "IWG" } as Partial<PlayerCardData>),
      card({ name: "Sub", role: "Top", teamName: "Iron Wolves Gaming" }),
    ])[0];
    expect(tagged.abbr).toBe("IWG");
    // A league that has set no abbreviation still prints something: the
    // monogram, which is what the card showed before tags existed.
    const untagged = buildTeamCards([card({ name: "Star", teamName: "Iron Wolves Gaming" })])[0];
    expect(untagged.abbr).toBeNull();
    expect(untagged.monogram).toBe("IWG");
  });

  it("carries the monogram and the Card of the Week star", () => {
    const team = buildTeamCards([
      card({ name: "Star", role: "Mid", teamName: "Iron Wolves Gaming", standout: true }),
    ])[0];
    expect(team.monogram).toBe("IWG");
    expect(team.slots.find((slot) => slot.role === "Mid")?.standout).toBe(true);
  });
});

describe("teamToCard", () => {
  const entry = () =>
    buildTeamCards(
      [card({ name: "Star", role: "Mid", overall: 80, signature: { champion: "Ahri", games: 9 } })],
      new Map([["faceless", "#c8102e"]]),
      "2026-08-24",
    )[0];

  it("wraps a roster print as a card every surface can already carry", () => {
    const wrapped = teamToCard(entry(), "S5", 3);

    // The renderer branches on `team` before it reads a rating.
    expect(wrapped.team?.teamName).toBe("Faceless");
    expect(wrapped.team?.copySerial).toBe(3);
    expect(wrapped.team?.bannerColor).toBe("#c8102e");
    expect(wrapped.tier.key).toBe(TEAM_TIER);
    expect(wrapped.name).toBe("Faceless");
    expect(wrapped.season).toBe("S5");
  });

  it("freezes the week it was minted from, so editions differ", () => {
    const early = teamToCard(entry(), "S5", 1);
    expect(early.team?.weekStart).toBe("2026-08-24");
    expect(early.slug).toBe(teamCardSlug("Faceless", "2026-08-24"));
    // A different week is a different collectible, on its own serial line.
    expect(teamCardSlug("Faceless", "2026-08-31")).not.toBe(early.slug);
  });

  it("slugs punctuated team names without collapsing two teams into one", () => {
    expect(teamCardSlug("The Original Mocha House", "2026-08-24")).toBe(
      "team-the-original-mocha-house-2026-08-24",
    );
    expect(teamCardSlug("Iron Wolves!", "2026-08-24")).toBe("team-iron-wolves-2026-08-24");
    expect(teamCardSlug("Iron Wolves", "2026-08-24")).not.toBe(teamCardSlug("Iron Wolf", "2026-08-24"));
  });

  it("prices flat, like every other relic", () => {
    expect(TEAM_DUST).toBeGreaterThan(0);
  });
});
