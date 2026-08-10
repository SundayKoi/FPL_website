import { describe, expect, it } from "vitest";

import { PLAYER_SEASONS, SEASON_OPTIONS } from "./seasonData";

describe("season player data", () => {
  it("offers Season 5 followed by Season 4", () => {
    expect(SEASON_OPTIONS.map(({ value }) => value)).toEqual([
      "season-5",
      "season-4",
    ]);
  });

  it("contains five Season 5 sections with twelve players each", () => {
    expect(PLAYER_SEASONS["season-5"]).toHaveLength(5);
    expect(PLAYER_SEASONS["season-5"].every(({ players }) => players.length === 12)).toBe(true);
  });

  it("has no Season 4 players", () => {
    expect(PLAYER_SEASONS["season-4"]).toEqual([]);
  });

  it("preserves the first Season 5 player", () => {
    expect(PLAYER_SEASONS["season-5"][0].players[0]).toEqual({
      name: "Captain: Winter",
      rank: "M10",
      min: 30,
      opggUrl: "https://op.gg/lol/summoners/na/Winter-Ashtn",
    });
  });
});
