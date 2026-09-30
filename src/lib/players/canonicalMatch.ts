import { normalizeBasePlayerName, normalizePlayerName as normalizeCanonicalName } from "./normalize";
import type { SeasonKey } from "./seasonData";
import type { LolRole } from "@/lib/draft/types";

export interface CanonicalPlayer {
  id: string;
  season_key: SeasonKey;
  normalized_name: string;
  display_name: string;
  role: LolRole;
  rank: string | null;
  opgg_url: string | null;
  created_at: string;
  updated_at: string;
}

export { normalizeCanonicalName };

export function matchCanonicalPlayer(
  name: string,
  candidates: CanonicalPlayer[],
): { match: CanonicalPlayer | null; confidence: "exact" | "alias" | "ambiguous" | "none" } {
  const baseName = normalizeBasePlayerName(name);
  const normalizedName = normalizeCanonicalName(name);
  const matches = candidates.filter((candidate) => candidate.normalized_name === normalizedName);

  if (matches.length === 0) {
    return { match: null, confidence: "none" };
  }

  if (matches.length > 1) {
    return { match: null, confidence: "ambiguous" };
  }

  return {
    match: matches[0],
    confidence: baseName === normalizedName ? "exact" : "alias",
  };
}
