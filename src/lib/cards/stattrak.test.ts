import { describe, expect, it } from "vitest";
import { gamePoints, type FantasyStatRow } from "@/lib/stats/fantasyPoints";
import { stattrakCredits, type TrackedCopy } from "./stattrak";

const game = (over: Partial<FantasyStatRow> & { game_date: string }): FantasyStatRow => ({
  summoner_name: "Doug",
  tag: "NA1",
  kills: 5,
  deaths: 2,
  assists: 4,
  cs_per_min: 8,
  vision_score: 20,
  damage_share_pct: 25,
  kill_participation_pct: 60,
  win: true,
  ...over,
});

const doug = (stattrak: TrackedCopy["stattrak"], id = 1): TrackedCopy => ({ id, slug: "doug-na1", stattrak });

describe("stattrakCredits", () => {
  const monday = game({ game_date: "2026-08-25T00:30:00.000Z" });
  const tuesday = game({ game_date: "2026-08-26T01:00:00.000Z", kills: 0, win: false });

  it("credits the player's games since the copy was pulled, and moves `through` to the last one", () => {
    const [credit] = stattrakCredits([doug({ since: "2026-08-24T12:00:00.000Z" })], [tuesday, monday]);
    expect(credit).toEqual({ id: 1, points: gamePoints(monday) + gamePoints(tuesday), through: "2026-08-26T01:00:00.000Z" });
  });

  it("counts nothing played before the copy was held, or before the last count", () => {
    expect(stattrakCredits([doug({ since: "2026-08-27T00:00:00.000Z" })], [monday, tuesday])).toEqual([]);
    const [credit] = stattrakCredits([doug({ since: "2026-08-24T00:00:00.000Z", through: "2026-08-25T00:30:00.000Z" })], [monday, tuesday]);
    expect(credit.points).toBe(gamePoints(tuesday));
  });

  it("only credits the pictured player, and only copies that carry the counter", () => {
    const other = game({ game_date: "2026-08-25T00:30:00.000Z", summoner_name: "Ari", tag: "NA1" });
    expect(stattrakCredits([{ id: 2, slug: "ari-na1", stattrak: null }], [other])).toEqual([]);
    expect(stattrakCredits([doug({ since: "2026-08-24T00:00:00.000Z" })], [other])).toEqual([]);
  });

  it("skips rows with no usable date rather than crediting them", () => {
    expect(stattrakCredits([doug({ since: "2026-08-24T00:00:00.000Z" })], [game({ game_date: "" })])).toEqual([]);
  });
});
