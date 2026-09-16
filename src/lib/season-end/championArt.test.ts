import { describe, expect, it } from "vitest";
import { CHAMPION_ART_CROPS, championArtCrop, DEFAULT_CHAMPION_ART_CROP } from "./championArt";

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
