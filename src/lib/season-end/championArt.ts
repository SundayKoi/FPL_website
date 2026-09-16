import { CHAMPIONS, championByName } from "@/lib/match-draft/champions";

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

/** Curated exceptions to the reviewed base-skin defaults. */
const CURATED_BASE_CROPS: Record<string, ChampionArtCrop> = {
  "Diana:0": { cropPositionX: 80, cropPositionY: 50, zoom: 1 },
  "Illaoi:0": { cropPositionX: 68, cropPositionY: 50, zoom: 1 },
  "Milio:0": { cropPositionX: 48, cropPositionY: 50, zoom: 1 },
  "Senna:0": { cropPositionX: 53, cropPositionY: 50, zoom: 1 },
  "Maokai:0": { cropPositionX: 70, cropPositionY: 50, zoom: 1 },
  "Jhin:0": { cropPositionX: 64, cropPositionY: 50, zoom: 1 },
  "Sivir:0": { cropPositionX: 64, cropPositionY: 50, zoom: 1 },
};

/**
 * Reviewed base-skin crop positions keyed by canonical Data Dragon ID.
 *
 * The registry is deliberately built from the same bundled roster that feeds
 * the draft and art resolvers. That makes a 50/50 crop an explicit reviewed
 * decision rather than an indistinguishable missing entry, while still
 * allowing future/unknown champions to use the safe fallback below.
 */
export const CHAMPION_ART_CROPS: Record<string, ChampionArtCrop> = Object.fromEntries(
  CHAMPIONS.map((champion) => [
    `${champion.id}:0`,
    CURATED_BASE_CROPS[`${champion.id}:0`] ?? DEFAULT_CHAMPION_ART_CROP,
  ]),
);

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

/** Whether the exact champion/skin pair has a reviewed entry in the registry. */
export function isChampionArtReviewed(name: string, skin = 0): boolean {
  const champion = championByName(name);
  return Boolean(champion && Object.hasOwn(CHAMPION_ART_CROPS, `${champion.id}:${skin}`));
}

/** Stable, readable export used by the developer crop-audit surface. */
export function exportChampionArtCrops(): Record<string, ChampionArtCrop> {
  return Object.fromEntries(
    CHAMPIONS.map((champion) => [champion.name, championArtCrop(champion.name, 0)]),
  );
}
