import { canonicalArtChampion } from "@/lib/cards/artwork";

export type VariantLeague = "premier" | "academy";

export interface BestOfVariantRequest {
  league: VariantLeague;
  season: string;
  summonerName: string;
  tag: string;
  awardedChampion: string;
}

export interface BestOfVariantSkin {
  num: number;
  name: string;
}

export interface BestOfVariantResponse {
  key: string;
  champion: string;
  skins: BestOfVariantSkin[];
  catalogAvailable: boolean;
  autograph: string | null;
  autographStatus: "available" | "missing" | "query-failed";
}

export function bestOfVariantKey(input: BestOfVariantRequest): string {
  return [
    input.league,
    input.season.trim(),
    input.summonerName.trim().toLowerCase(),
    input.tag.trim().toLowerCase(),
    canonicalArtChampion(input.awardedChampion).toLowerCase(),
  ].join("|");
}

export function normalizeBestOfVariantRequest(input: BestOfVariantRequest): BestOfVariantRequest {
  return {
    league: input.league,
    season: input.season.trim(),
    summonerName: input.summonerName.trim(),
    tag: input.tag.trim(),
    awardedChampion: canonicalArtChampion(input.awardedChampion),
  };
}
