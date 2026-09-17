import { describe, expect, it } from "vitest";
import { bestOfVariantKey, normalizeBestOfVariantRequest } from "./variantPreview";

describe("Best Of variant preview identity", () => {
  it("keys the local preview by league, season, full identity, and awarded champion", () => {
    const first = normalizeBestOfVariantRequest({
      league: "premier",
      season: "S5",
      summonerName: "Alice",
      tag: "NA1",
      awardedChampion: "MonkeyKing",
    });
    const second = normalizeBestOfVariantRequest({
      ...first,
      tag: "NA2",
      awardedChampion: "Wukong",
    });

    expect(bestOfVariantKey(first)).toBe("premier|S5|alice|na1|wukong");
    expect(bestOfVariantKey(second)).toBe("premier|S5|alice|na2|wukong");
    expect(bestOfVariantKey(first)).not.toBe(bestOfVariantKey(second));
  });

  it("trims request fields while preserving the selected season", () => {
    expect(normalizeBestOfVariantRequest({
      league: "academy",
      season: " A1 ",
      summonerName: " Bob ",
      tag: " NA1 ",
      awardedChampion: " Azir ",
    })).toEqual({
      league: "academy",
      season: "A1",
      summonerName: "Bob",
      tag: "NA1",
      awardedChampion: "Azir",
    });
  });
});
