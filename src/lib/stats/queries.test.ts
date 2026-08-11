import { describe, expect, it } from "vitest";
import { compareSeasonsNewestFirst } from "./queries";

// Only the pure sort helper is tested here — not the network fetchers
// (fetchPlayerAgg, fetchSeasons, etc.), which need a Supabase client.

describe("compareSeasonsNewestFirst", () => {
  it("sorts numeric season codes newest first, not lexicographically", () => {
    const seasons = ["S1", "S10", "S2", "S9"];
    expect(seasons.sort(compareSeasonsNewestFirst)).toEqual(["S10", "S9", "S2", "S1"]);
  });

  it("keeps a plain S1..S4 run in the expected newest-first order", () => {
    const seasons = ["S3", "S1", "S4", "S2"];
    expect(seasons.sort(compareSeasonsNewestFirst)).toEqual(["S4", "S3", "S2", "S1"]);
  });

  it("falls back to descending string compare for non-numeric codes", () => {
    const seasons = ["Preseason", "Beta"];
    expect(seasons.sort(compareSeasonsNewestFirst)).toEqual(["Preseason", "Beta"]);
  });

  it("puts numeric codes ahead of non-numeric codes", () => {
    const seasons = ["Preseason", "S1"];
    expect(seasons.sort(compareSeasonsNewestFirst)).toEqual(["S1", "Preseason"]);
  });
});
