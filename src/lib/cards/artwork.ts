import type { SupabaseClient } from "@supabase/supabase-js";
import { fetchAllPages } from "@/lib/supabase/pagination";
import { championDisplayName } from "@/lib/match-draft/champions";
import { fetchChampionSkinCatalog, type ChampionSkin } from "@/lib/packs/skins";

export interface PlayedChampion {
  champion: string;
  games: number;
}

export interface PlayedChampionsResult {
  available: boolean;
  champions: PlayedChampion[];
}

export interface ArtCatalogResult {
  available: boolean;
  skins: ChampionSkin[];
}

/** The same canonical display name used by card statistics and art URLs. */
export function canonicalArtChampion(champion: string): string {
  return championDisplayName(champion.trim());
}

/**
 * Every champion a full Riot identity played in this exact season. One raw
 * appearance qualifies; the tag is part of the filter because display names
 * are not unique.
 */
export async function fetchPlayedChampions(
  supabase: SupabaseClient,
  season: string,
  summonerName: string,
  tag: string,
): Promise<PlayedChampionsResult> {
  try {
    const rows = await fetchAllPages<{ champion: string | null }>((from, to) =>
      supabase
        .from("raw_stats")
        .select("champion")
        .eq("season", season)
        .eq("summoner_name", summonerName)
        .eq("tag", tag)
        .not("champion", "is", null)
        .order("id")
        .range(from, to),
    );
    const counts = new Map<string, number>();
    for (const row of rows) {
      if (!row.champion?.trim()) continue;
      const champion = canonicalArtChampion(row.champion);
      counts.set(champion, (counts.get(champion) ?? 0) + 1);
    }
    return {
      available: true,
      champions: [...counts.entries()]
        .map(([champion, games]) => ({ champion, games }))
        .sort((a, b) => b.games - a.games || a.champion.localeCompare(b.champion)),
    };
  } catch {
    return { available: false, champions: [] };
  }
}

export function isPlayedChampion(champions: PlayedChampion[], champion: string): boolean {
  const key = canonicalArtChampion(champion);
  return champions.some((entry) => canonicalArtChampion(entry.champion) === key);
}

export async function fetchArtCatalog(champion: string): Promise<ArtCatalogResult> {
  const result = await fetchChampionSkinCatalog(champion);
  return { available: result.available, skins: result.skins };
}
