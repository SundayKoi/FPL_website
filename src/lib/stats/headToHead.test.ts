import { describe, expect, it } from "vitest";
import {
  buildHeadToHead,
  overallRecord,
  recordBetween,
  winRateBetween,
  type HeadToHeadRow,
} from "./headToHead";

/** One game: five names on the winning side, five on the losing side. */
function game(matchId: string, winners: string[], losers: string[]): HeadToHeadRow[] {
  return [
    ...winners.map((name) => ({ match_id: matchId, team_name: "Alpha", summoner_name: name, win: true })),
    ...losers.map((name) => ({ match_id: matchId, team_name: "Beta", summoner_name: name, win: false })),
  ];
}

describe("buildHeadToHead", () => {
  it("records a win for everyone on the winning side against everyone opposite", () => {
    const h2h = buildHeadToHead(game("m1", ["Ari"], ["Bo"]));
    expect(recordBetween(h2h, "Ari", "Bo")).toEqual({ wins: 1, losses: 0 });
  });

  it("records the mirror image, so a lookup never has to try both ways", () => {
    const h2h = buildHeadToHead(game("m1", ["Ari"], ["Bo"]));
    expect(recordBetween(h2h, "Bo", "Ari")).toEqual({ wins: 0, losses: 1 });
  });

  it("never pairs teammates against each other", () => {
    const h2h = buildHeadToHead(game("m1", ["Ari", "Cy"], ["Bo"]));
    expect(recordBetween(h2h, "Ari", "Cy")).toBeNull();
  });

  it("accumulates across games", () => {
    const h2h = buildHeadToHead([
      ...game("m1", ["Ari"], ["Bo"]),
      ...game("m2", ["Ari"], ["Bo"]),
      ...game("m3", ["Bo"], ["Ari"]),
    ]);
    expect(recordBetween(h2h, "Ari", "Bo")).toEqual({ wins: 2, losses: 1 });
    expect(winRateBetween(h2h, "Ari", "Bo")).toBeCloseTo(66.67, 1);
  });

  it("drops a game that does not have exactly two sides", () => {
    // A partially-ingested match: pairing across three "teams" would
    // invent matchups nobody played.
    const threeWay: HeadToHeadRow[] = [
      { match_id: "m1", team_name: "Alpha", summoner_name: "Ari", win: true },
      { match_id: "m1", team_name: "Beta", summoner_name: "Bo", win: false },
      { match_id: "m1", team_name: "Gamma", summoner_name: "Cy", win: false },
    ];
    expect(buildHeadToHead(threeWay).players).toHaveLength(0);
  });

  it("drops a game nobody is recorded as winning", () => {
    const noResult: HeadToHeadRow[] = [
      { match_id: "m1", team_name: "Alpha", summoner_name: "Ari", win: null },
      { match_id: "m1", team_name: "Beta", summoner_name: "Bo", win: null },
    ];
    expect(recordBetween(buildHeadToHead(noResult), "Ari", "Bo")).toBeNull();
  });

  it("skips rows missing the identity a matchup needs", () => {
    const partial: HeadToHeadRow[] = [
      { match_id: null, team_name: "Alpha", summoner_name: "Ari", win: true },
      { match_id: "m1", team_name: null, summoner_name: "Bo", win: false },
      { match_id: "m1", team_name: "Beta", summoner_name: null, win: false },
    ];
    expect(buildHeadToHead(partial).players).toHaveLength(0);
  });

  it("returns null for two players who have never met", () => {
    const h2h = buildHeadToHead([...game("m1", ["Ari"], ["Bo"]), ...game("m2", ["Cy"], ["Dee"])]);
    expect(recordBetween(h2h, "Ari", "Cy")).toBeNull();
    expect(winRateBetween(h2h, "Ari", "Cy")).toBeNull();
  });

  it("sums a player's record across every opponent", () => {
    const h2h = buildHeadToHead([...game("m1", ["Ari"], ["Bo", "Cy"]), ...game("m2", ["Bo"], ["Ari"])]);
    // Beat Bo and Cy in m1, lost to Bo in m2.
    expect(overallRecord(h2h, "Ari")).toEqual({ wins: 2, losses: 1 });
  });

  it("lists players sorted, so the matrix axes are stable", () => {
    const h2h = buildHeadToHead(game("m1", ["Zed", "Ari"], ["Bo"]));
    expect(h2h.players).toEqual(["Ari", "Bo", "Zed"]);
  });

  it("remembers which team each player appeared for", () => {
    const h2h = buildHeadToHead(game("m1", ["Ari"], ["Bo"]));
    expect(h2h.teamOf.get("Ari")).toBe("Alpha");
    expect(h2h.teamOf.get("Bo")).toBe("Beta");
  });
});
