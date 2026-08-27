import { describe, expect, it } from "vitest";
import { rankGauntletWeek } from "./settle";

const run = (discord_id: string, score: number, round = 3, status = "fallen") => ({ discord_id, score, round, status });

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
