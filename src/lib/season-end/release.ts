import { FOIL_CHANCE, FOIL_TYPE_WEIGHTS, SIGNED_CHANCE_CAP, type MintableFoilType } from "@/lib/packs/config";
import type { SeasonEndKind } from "./collectibles";

/** Pure release contract shared by the catalog builder, UI copy and tests. */
export const SEASON_END_RELEASE_PRODUCT = "season_end" as const;
export const SEASON_END_PACK_SIZE = 5 as const;
export const SEASON_END_PACK_PRICE = 500 as const;
export const SEASON_END_RULES_VERSION = "season-end-2026-09-v1" as const;

export interface SeasonEndReleaseRules {
  foilChance: number;
  slot34FamilyWeights: Record<"accolade" | "best_of", number>;
  slot5FamilyWeights: Record<SeasonEndKind, number>;
  guaranteedSlot: 5;
  signatureChanceCap: number;
  foilTypeWeights: Record<MintableFoilType, number>;
}

export const SEASON_END_RELEASE_RULES: SeasonEndReleaseRules = {
  foilChance: FOIL_CHANCE,
  slot34FamilyWeights: { accolade: 50, best_of: 50 },
  slot5FamilyWeights: { season: 50, accolade: 25, best_of: 25 },
  guaranteedSlot: 5,
  signatureChanceCap: SIGNED_CHANCE_CAP,
  foilTypeWeights: { ...FOIL_TYPE_WEIGHTS },
};

export const SEASON_END_SLOT_CONTRACT = [
  { slot: 1, label: "Season Card", family: "season" as const },
  { slot: 2, label: "Season Card", family: "season" as const },
  { slot: 3, label: "Accolade or Best Of", family: "award" as const },
  { slot: 4, label: "Accolade or Best Of", family: "award" as const },
  { slot: 5, label: "Guaranteed foil", family: "any" as const },
] as const;
