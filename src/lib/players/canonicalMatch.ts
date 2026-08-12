import { PLAYER_SEASONS, type SeasonKey } from "./seasonData";
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

export interface CanonicalSeedPlayer {
  season_key: SeasonKey;
  normalized_name: string;
  display_name: string;
  role: LolRole;
  rank: string | null;
  opgg_url: string | null;
}

const CANONICAL_NAME_ALIASES: Record<string, string> = {
  "flyinq squirtle": "flying squirtle",
  "conguitos0": "conguitos",
  begfourmercy: "beg",
  "08 mitsu eclipse": "chime",
};

function normalizeCanonicalBaseName(name: string): string {
  return name
    .normalize("NFKC")
    .trim()
    .replace(/^captain:\s*/i, "")
    .split("#")[0]
    .trim()
    .replace(/\s+/g, " ")
    .toLocaleLowerCase();
}

export function normalizeCanonicalName(name: string): string {
  const normalized = normalizeCanonicalBaseName(name);
  return CANONICAL_NAME_ALIASES[normalized] ?? normalized;
}

export function buildCanonicalSeedPlayers(seasonKey: SeasonKey): CanonicalSeedPlayer[] {
  return PLAYER_SEASONS[seasonKey].flatMap(({ key, players }) =>
    players.map((player) => ({
      season_key: seasonKey,
      normalized_name: normalizeCanonicalName(player.name),
      display_name: player.name,
      role: key,
      rank: player.rank,
      opgg_url: player.opggUrl,
    })),
  );
}

export function matchCanonicalPlayer(
  name: string,
  candidates: CanonicalPlayer[],
): { match: CanonicalPlayer | null; confidence: "exact" | "alias" | "ambiguous" | "none" } {
  const baseName = normalizeCanonicalBaseName(name);
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
