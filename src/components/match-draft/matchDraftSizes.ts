import type { MatchDraftImageSize } from "@/lib/match-draft/types";

export interface MatchDraftImageSizeConfig {
  label: string;
  slot: string;
  banSize: string;
  poolMinWidth: string;
  name: string;
}

/** Shared presentation tokens. Pool density is deliberately separate from
 * pick/ban sizing: the center panel has a different amount of space than a
 * team rail at each breakpoint. */
export const MATCH_DRAFT_IMAGE_SIZES: Record<MatchDraftImageSize, MatchDraftImageSizeConfig> = {
  md: { label: "MD", slot: "min-h-28", banSize: "56px", poolMinWidth: "56px", name: "text-xs" },
  lg: { label: "LG", slot: "min-h-32", banSize: "64px", poolMinWidth: "64px", name: "text-sm" },
};

export const MATCH_DRAFT_IMAGE_SIZE_ORDER: MatchDraftImageSize[] = ["md", "lg"];
