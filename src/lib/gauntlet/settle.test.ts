import { describe, expect, it } from "vitest";
import { gauntletPot, rankGauntletWeek } from "./settle";

const run = (discord_id: string, score: number, round = 3, status = "fallen", ascension = 0) => ({ discord_id, score, round, status, ascension });

describe("rankGauntletWeek", () => {
  it("keeps each user's best run and ranks by score, id as the stable tiebreak", () => {
    const ranked = rankGauntletWeek([
      run("bob", 400),
      run("bob", 900, 5),
      run("ann", 900, 4),
      run("cal", 1200, 8, "cleared"),
    ]);
    expect(ranked.map((r) => r.discordId)).toEqual(["cal", "ann", "bob"]);
    expect(ranked[0].cleared).toBe(true);
    // bob's 400 run is gone — one line per user.
    expect(ranked).toHaveLength(3);
    expect(ranked[2].score).toBe(900);
  });

  it("is deterministic on dead-even scores", () => {
    const a = rankGauntletWeek([run("zed", 500), run("abe", 500)]);
    expect(a.map((r) => r.discordId)).toEqual(["abe", "zed"]);
  });
});

describe("rankGauntletWeek — ascension", () => {
  it("ranks by the weighted score and keeps a player's best WEIGHTED run", () => {
    const ranked = rankGauntletWeek([
      run("ann", 1000, 5, "fallen", 0),
      run("bob", 900, 4, "fallen", 2), // 1080
      run("bob", 1050, 5, "fallen", 0),
    ]);
    expect(ranked.map((r) => [r.discordId, r.score, r.weighted, r.ascension])).toEqual([
      ["bob", 900, 1080, 2],
      ["ann", 1000, 1000, 0],
    ]);
  });
});

describe("gauntletPot", () => {
  it("is the fees less what the purses already paid, never below zero", () => {
    expect(gauntletPot([{ purse_paid: 0 }, { purse_paid: 48 }, { purse_paid: null }, {}])).toBe(4 * 50 - 48);
    expect(gauntletPot([{ purse_paid: 500 }])).toBe(0);
    expect(gauntletPot([])).toBe(0);
  });
});
