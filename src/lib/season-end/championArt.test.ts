import { describe, expect, it } from "vitest";
import { CHAMPIONS } from "@/lib/match-draft/champions";
import { CHAMPION_ART_CROPS, championArtCrop, DEFAULT_CHAMPION_ART_CROP, exportChampionArtCrops, isChampionArtReviewed } from "./championArt";

describe("championArtCrop", () => {
  it("uses the reviewed base-skin crops", () => {
    expect(championArtCrop("Milio", 0)).toEqual({ cropPositionX: 48, cropPositionY: 50, zoom: 1 });
    expect(championArtCrop("Senna", 0)).toEqual({ cropPositionX: 53, cropPositionY: 50, zoom: 1 });
    expect(championArtCrop("Maokai", 0)).toEqual({ cropPositionX: 70, cropPositionY: 50, zoom: 1 });
    expect(championArtCrop("Jhin", 0)).toEqual({ cropPositionX: 64, cropPositionY: 50, zoom: 1 });
  });

  it("resolves canonical aliases to the same crop registry entry", () => {
    expect(championArtCrop("MonkeyKing", 0)).toEqual(championArtCrop("Wukong", 0));
    expect(championArtCrop("mIlIo", 0)).toEqual(championArtCrop("Milio", 0));
  });

  it("falls back safely for unknown champions and unreviewed skins", () => {
    expect(championArtCrop("Unknown Future Champion", 0)).toEqual(DEFAULT_CHAMPION_ART_CROP);
    expect(championArtCrop("Milio", 1)).toEqual(DEFAULT_CHAMPION_ART_CROP);
    expect(isChampionArtReviewed("Unknown Future Champion", 0)).toBe(false);
    expect(isChampionArtReviewed("Milio", 1)).toBe(false);
  });

  it("covers every supported champion's base skin explicitly", () => {
    expect(Object.keys(CHAMPION_ART_CROPS)).toHaveLength(CHAMPIONS.length);
    for (const champion of CHAMPIONS) {
      expect(isChampionArtReviewed(champion.name, 0)).toBe(true);
      expect(CHAMPION_ART_CROPS[`${champion.id}:0`]).toEqual(championArtCrop(champion.name, 0));
    }
  });

  it("exports readable champion names without losing the curated values", () => {
    const exported = exportChampionArtCrops();
    expect(exported.Senna).toEqual({ cropPositionX: 53, cropPositionY: 50, zoom: 1 });
    expect(exported.Diana).toEqual({ cropPositionX: 80, cropPositionY: 50, zoom: 1 });
    expect(Object.keys(exported)).toHaveLength(CHAMPIONS.length);
  });

  it("keeps every reviewed entry within CSS percentage and zoom bounds", () => {
    for (const crop of Object.values(CHAMPION_ART_CROPS)) {
      expect(Number.isFinite(crop.cropPositionX)).toBe(true);
      expect(Number.isFinite(crop.cropPositionY)).toBe(true);
      expect(crop.cropPositionX).toBeGreaterThanOrEqual(0);
      expect(crop.cropPositionX).toBeLessThanOrEqual(100);
      expect(crop.cropPositionY).toBeGreaterThanOrEqual(0);
      expect(crop.cropPositionY).toBeLessThanOrEqual(100);
      expect(Number.isFinite(crop.zoom)).toBe(true);
      expect(crop.zoom).toBeGreaterThan(0);
    }
  });
});
