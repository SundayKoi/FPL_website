import { describe, expect, it } from "vitest";
import type { PlayerCardData } from "@/lib/cards/build";
import { echoPool, nextOpponent, rosterTeam, surgeTeams, teamsPlayingOn } from "./matchday";

const card = (teamName: string | null, extra: Partial<PlayerCardData> = {}) =>
  ({ card: { teamName, ...extra } as unknown as PlayerCardData });

// Monday 8pm Eastern is 00:00 UTC Tuesday: the Eastern calendar, not UTC,
// decides which day a fixture is on.
const FIXTURES = [
  { team_a: "Solari Sun", team_b: "Lunar Tide", scheduled_at: "2026-09-08T00:00:00.000Z" },
  { team_a: "Night Owls", team_b: null, scheduled_at: "2026-09-08T00:30:00.000Z" },
  { team_a: "Solari Sun", team_b: "Night Owls", scheduled_at: "2026-09-15T00:00:00.000Z" },
  { team_a: "Old Guard", team_b: "Lunar Tide", scheduled_at: null },
];

describe("teamsPlayingOn", () => {
  it("reads the fixture's day on the Eastern calendar and keys teams the way badges are", () => {
    const playing = teamsPlayingOn(FIXTURES, "2026-09-07");
    expect([...playing.keys()].sort()).toEqual(["lunartide", "nightowls", "solarisun"]);
    expect(playing.get("solarisun")).toBe("Solari Sun");
    expect(teamsPlayingOn(FIXTURES, "2026-09-08").size).toBe(0);
  });

  it("ignores a fixture with no time", () => {
    expect(teamsPlayingOn(FIXTURES, "2026-09-14").has("oldguard")).toBe(false);
  });
});

describe("surgeTeams", () => {
  it("names each playing team the squad carries, once, as the fixture spells it", () => {
    const playing = teamsPlayingOn(FIXTURES, "2026-09-07");
    expect(surgeTeams([card("solari sun"), card("Solari Sun"), card("Old Guard")], playing)).toEqual(["Solari Sun"]);
    expect(surgeTeams([card("Old Guard"), card(null)], playing)).toEqual([]);
  });
});

describe("rosterTeam", () => {
  it("is the one team a whole squad shares, and nothing otherwise", () => {
    expect(rosterTeam([card("Solari Sun"), card("solari sun")])).toBe("Solari Sun");
    expect(rosterTeam([card("Solari Sun"), card("Lunar Tide")])).toBeNull();
    expect(rosterTeam([card("Solari Sun"), card(null)])).toBeNull();
    expect(rosterTeam([])).toBeNull();
  });
});

describe("nextOpponent", () => {
  it("is the other side of the soonest fixture on or after the date", () => {
    expect(nextOpponent(FIXTURES, "Solari Sun", new Date("2026-09-01T00:00:00Z"))).toBe("Lunar Tide");
    expect(nextOpponent(FIXTURES, "Solari Sun", new Date("2026-09-09T00:00:00Z"))).toBe("Night Owls");
    expect(nextOpponent(FIXTURES, "Lunar Tide", new Date("2026-09-09T00:00:00Z"))).toBeNull();
  });

  it("stays nameless against a TBD side", () => {
    expect(nextOpponent(FIXTURES, "Night Owls", new Date("2026-09-01T00:00:00Z"))).toBeNull();
  });
});

describe("echoPool", () => {
  const edition = [
    { slug: "a", teamName: "Solari Sun" },
    { slug: "b", teamName: "Lunar Tide" },
    { slug: "c", teamName: "Night Owls" },
    { slug: "plate", teamName: "Solari Sun", team: {} },
    { slug: "moment", teamName: "Solari Sun", moment: {} },
  ] as unknown as PlayerCardData[];

  it("is every player card from either side of the moment's game", () => {
    expect(echoPool({ teamName: "Solari Sun", opponent: "lunar tide" }, edition).map((c) => c.slug)).toEqual(["a", "b"]);
  });

  it("is one side when the copy was frozen before opponents were recorded, and nothing with no team", () => {
    expect(echoPool({ teamName: "Solari Sun" }, edition).map((c) => c.slug)).toEqual(["a"]);
    expect(echoPool({ teamName: null, opponent: null }, edition)).toEqual([]);
  });
});
