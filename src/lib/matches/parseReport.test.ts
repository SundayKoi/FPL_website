import { describe, expect, it } from "vitest";
import { parseReport } from "./parseReport";
import type { LeagueTeam } from "./types";

const team = (over: Partial<LeagueTeam> = {}): LeagueTeam => ({
  id: "t1", name: "Team One", abbreviation: "T1", active: true, ...over,
});

const mic = team({ id: "team-mic", name: "Midnight Icers", abbreviation: "MIC" });
const bbc = team({ id: "team-bbc", name: "Blue Barrier Co", abbreviation: "BBC" });

// The exact captain's post from the design spec / task brief.
const DISCORD_EXAMPLE = `MIC 3-0 BBC
https://drafter.lol/draft/T4cB_WHp?game=1 5568297187
https://drafter.lol/draft/T4cB_WHp?game=2 5568352310
https://drafter.lol/draft/T4cB_WHp?game=3 5568409447`;

describe("parseReport", () => {
  it("parses the exact Discord example", () => {
    expect(parseReport(DISCORD_EXAMPLE, [mic, bbc])).toEqual({
      teamAId: "team-mic",
      teamBId: "team-bbc",
      teamAToken: "MIC",
      teamBToken: "BBC",
      scoreA: 3,
      scoreB: 0,
      draftUrl: "https://drafter.lol/draft/T4cB_WHp",
      games: [
        { gameNumber: 1, matchId: "NA1_5568297187" },
        { gameNumber: 2, matchId: "NA1_5568352310" },
        { gameNumber: 3, matchId: "NA1_5568409447" },
      ],
      warnings: [],
    });
  });

  it("treats the site's own match-draft links as match lines and never reads the fixture uuid as an id", () => {
    // 12345678 in the uuid must NOT become a match id; the trailing id must.
    const text = `MIC 2-0 BBC
https://fpl.example.com/match-draft/12345678-90ab-4cde-8f01-234567890abc?game=1 5568297187
https://fpl.example.com/match-draft/12345678-90ab-4cde-8f01-234567890abc?game=2 5568352310
random prose with 99887766 in it`;
    const result = parseReport(text, [mic, bbc]);
    expect(result.draftUrl).toBe("https://fpl.example.com/match-draft/12345678-90ab-4cde-8f01-234567890abc");
    expect(result.games).toEqual([
      { gameNumber: 1, matchId: "NA1_5568297187" },
      { gameNumber: 2, matchId: "NA1_5568352310" },
    ]);
    expect(result.warnings).toEqual(["Ignored 1 number(s) outside the match lines"]);
  });

  it("treats public /drafter lobby links as match lines too", () => {
    const text = "http://localhost:3000/drafter/aBcD1234tok?game=1 5568297187";
    const result = parseReport(text, [mic, bbc]);
    expect(result.draftUrl).toBe("http://localhost:3000/drafter/aBcD1234tok");
    expect(result.games).toEqual([{ gameNumber: 1, matchId: "NA1_5568297187" }]);
  });

  it("accepts already-prefixed NA1_ ids as-is (no double prefix)", () => {
    const text = `MIC 2-1 BBC
https://drafter.lol/draft/abc?game=1 NA1_5568297187
https://drafter.lol/draft/abc?game=2 NA1_5568352310`;
    const result = parseReport(text, [mic, bbc]);
    expect(result.games).toEqual([
      { gameNumber: 1, matchId: "NA1_5568297187" },
      { gameNumber: 2, matchId: "NA1_5568352310" },
    ]);
  });

  it("handles a single-game report with no score line", () => {
    const text = "https://drafter.lol/draft/abc?game=1 5568297187";
    const result = parseReport(text, [mic, bbc]);
    expect(result.scoreA).toBeNull();
    expect(result.scoreB).toBeNull();
    expect(result.teamAId).toBeNull();
    expect(result.teamBId).toBeNull();
    expect(result.teamAToken).toBeNull();
    expect(result.teamBToken).toBeNull();
    expect(result.games).toEqual([{ gameNumber: 1, matchId: "NA1_5568297187" }]);
    expect(result.warnings).toEqual([]);
  });

  it("leaves teamAId null and warns naming the token on an unknown abbreviation", () => {
    const result = parseReport("XYZ 1-0 MIC", [mic, bbc]);
    expect(result.teamAId).toBeNull();
    expect(result.teamAToken).toBe("XYZ");
    expect(result.teamBId).toBe("team-mic");
    expect(result.scoreA).toBe(1);
    expect(result.scoreB).toBe(0);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toContain("XYZ");
  });

  it("ignores extra prose and screenshot-caption lines around the report", () => {
    const text = `gg well played everyone
MIC 3-0 BBC
here's the screenshot:
https://drafter.lol/draft/T4cB_WHp?game=1 5568297187
[image attached]
https://drafter.lol/draft/T4cB_WHp?game=2 5568352310
gl next round
https://drafter.lol/draft/T4cB_WHp?game=3 5568409447`;
    const result = parseReport(text, [mic, bbc]);
    expect(result.teamAId).toBe("team-mic");
    expect(result.teamBId).toBe("team-bbc");
    expect(result.scoreA).toBe(3);
    expect(result.scoreB).toBe(0);
    expect(result.games).toHaveLength(3);
    expect(result.warnings).toEqual([]);
  });

  it("dedupes a match id that appears twice, preserving first-seen order", () => {
    const text = `MIC 2-0 BBC
https://drafter.lol/draft/abc?game=1 5568297187
https://drafter.lol/draft/abc?game=1 5568297187
https://drafter.lol/draft/abc?game=2 5568352310`;
    const result = parseReport(text, [mic, bbc]);
    expect(result.games).toEqual([
      { gameNumber: 1, matchId: "NA1_5568297187" },
      { gameNumber: 2, matchId: "NA1_5568352310" },
    ]);
  });

  it("falls back to 1-based order when lines have no ?game= param", () => {
    const text = `MIC 2-0 BBC
5568297187
5568352310`;
    const result = parseReport(text, [mic, bbc]);
    expect(result.games).toEqual([
      { gameNumber: 1, matchId: "NA1_5568297187" },
      { gameNumber: 2, matchId: "NA1_5568352310" },
    ]);
  });

  it("resolves abbreviations case-insensitively", () => {
    const result = parseReport("mic 1-0 bbc", [mic, bbc]);
    expect(result.teamAId).toBe("team-mic");
    expect(result.teamBId).toBe("team-bbc");
  });

  it("falls back to team name when the token doesn't match any abbreviation", () => {
    const short = team({ id: "team-short", name: "ABCDE", abbreviation: "ZZZZZ" });
    const result = parseReport("ABCDE 1-0 MIC", [mic, bbc, short]);
    expect(result.teamAId).toBe("team-short");
  });

  it("accepts an en dash as the score separator", () => {
    const result = parseReport("MIC 2–1 BBC", [mic, bbc]);
    expect(result.scoreA).toBe(2);
    expect(result.scoreB).toBe(1);
  });

  it("uses the first score line when multiple lines match the pattern", () => {
    const text = `MIC 3-0 BBC
XYZ 9-9 ABC`;
    const result = parseReport(text, [mic, bbc]);
    expect(result.scoreA).toBe(3);
    expect(result.scoreB).toBe(0);
    expect(result.teamAToken).toBe("MIC");
    expect(result.teamBToken).toBe("BBC");
  });

  it("returns nulls, empty games and no warnings for text with nothing to parse", () => {
    expect(parseReport("just some random text", [mic, bbc])).toEqual({
      teamAId: null,
      teamBId: null,
      teamAToken: null,
      teamBToken: null,
      scoreA: null,
      scoreB: null,
      draftUrl: null,
      games: [],
      warnings: [],
    });
  });

  // Fix round: Discord noise must never manufacture phantom games. These
  // three inputs are the exact adversarial cases review demonstrated live —
  // a CDN screenshot link, prose with a plausible-length number, and a
  // message permalink — each pasted alongside the 3 real game lines.
  describe("ignores Discord noise alongside real game lines", () => {
    const REAL_LINES = `https://drafter.lol/draft/T4cB_WHp?game=1 5568297187
https://drafter.lol/draft/T4cB_WHp?game=2 5568352310
https://drafter.lol/draft/T4cB_WHp?game=3 5568409447`;
    const EXPECTED_GAMES = [
      { gameNumber: 1, matchId: "NA1_5568297187" },
      { gameNumber: 2, matchId: "NA1_5568352310" },
      { gameNumber: 3, matchId: "NA1_5568409447" },
    ];

    it("a Discord CDN screenshot link (18-digit snowflakes) adds no phantom games", () => {
      const text = `MIC 3-0 BBC
https://cdn.discordapp.com/attachments/123456789012345678/234567890123456789/screenshot.png
${REAL_LINES}`;
      const result = parseReport(text, [mic, bbc]);
      expect(result.games).toEqual(EXPECTED_GAMES);
      expect(result.warnings).toEqual([]);
    });

    it("prose containing a plausible-length number is excluded and warned about, not counted as a game", () => {
      const text = `MIC 3-0 BBC
we hit 123456789 damage
${REAL_LINES}`;
      const result = parseReport(text, [mic, bbc]);
      expect(result.games).toEqual(EXPECTED_GAMES);
      expect(result.warnings).toEqual(["Ignored 1 number(s) outside the match lines"]);
    });

    it("a Discord message permalink (three 18-digit snowflakes) adds no phantom games", () => {
      const text = `MIC 3-0 BBC
https://discord.com/channels/123456789012345678/234567890123456789/345678901234567890
${REAL_LINES}`;
      const result = parseReport(text, [mic, bbc]);
      expect(result.games).toEqual(EXPECTED_GAMES);
      expect(result.warnings).toEqual([]);
    });
  });

  it("renumbers games and warns when two entries would share a gameNumber", () => {
    const text = `MIC 2-0 BBC
https://drafter.lol/draft/abc?game=1 5568297187
https://drafter.lol/draft/abc?game=1 5568352310`;
    const result = parseReport(text, [mic, bbc]);
    expect(result.games).toEqual([
      { gameNumber: 1, matchId: "NA1_5568297187" },
      { gameNumber: 2, matchId: "NA1_5568352310" },
    ]);
    expect(result.warnings).toHaveLength(1);
    expect(result.warnings[0]).toMatch(/renumber/i);
  });
});
