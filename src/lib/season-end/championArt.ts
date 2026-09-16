import { championByName } from "@/lib/match-draft/champions";

export interface ChampionArtCrop {
  /** CSS background-position percentage for the horizontal crop. */
  cropPositionX: number;
  /** CSS background-position percentage for the vertical crop. */
  cropPositionY: number;
  /** Cover-art scale multiplier. Base art currently uses 1 (cover). */
  zoom: number;
}

export const DEFAULT_CHAMPION_ART_CROP: ChampionArtCrop = {
  cropPositionX: 50,
  cropPositionY: 50,
  zoom: 1,
};

/** Reviewed base-skin crop positions keyed by canonical Data Dragon ID. */
export const CHAMPION_ART_CROPS: Record<string, ChampionArtCrop> = {
  "Milio:0": { cropPositionX: 48, cropPositionY: 50, zoom: 1 },
  "Senna:0": { cropPositionX: 53, cropPositionY: 50, zoom: 1 },
  "Maokai:0": { cropPositionX: 70, cropPositionY: 50, zoom: 1 },
  "Jhin:0": { cropPositionX: 64, cropPositionY: 50, zoom: 1 },
};

/**
 * Returns the curated Best-of crop for a champion/skin pair.
 *
 * The resolver deliberately falls back to a centered cover crop for new or
 * unreviewed champions. Only the exact base-skin entries above are curated;
 * they must not leak into alternate skins.
 */
export function championArtCrop(name: string, skin = 0): ChampionArtCrop {
  const champion = championByName(name);
  return champion
    ? CHAMPION_ART_CROPS[`${champion.id}:${skin}`] ?? DEFAULT_CHAMPION_ART_CROP
    : DEFAULT_CHAMPION_ART_CROP;
}
