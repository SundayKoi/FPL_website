import { CHAMPIONS, championFromDataDragon, type MatchDraftChampion } from "./champions";

const VERSIONS_URL = "https://ddragon.leagueoflegends.com/api/versions.json";
const REVALIDATE_SECONDS = 6 * 60 * 60;

/** The current champion roster straight from Riot's Data Dragon: newest
 *  version first from versions.json, then that version's champion.json for
 *  the full name/id list — so a new patch or champion release shows up here
 *  without a code change. Cached for six hours; any failure (offline dev,
 *  Riot hiccup) falls back to the static bundled roster. */
export async function fetchLiveChampions(): Promise<MatchDraftChampion[]> {
  try {
    const versionsResponse = await fetch(VERSIONS_URL, { next: { revalidate: REVALIDATE_SECONDS } });
    if (!versionsResponse.ok) return CHAMPIONS;
    const versions = (await versionsResponse.json()) as string[];
    const version = versions?.[0];
    if (!version) return CHAMPIONS;

    const rosterResponse = await fetch(
      `https://ddragon.leagueoflegends.com/cdn/${version}/data/en_US/champion.json`,
      { next: { revalidate: REVALIDATE_SECONDS } },
    );
    if (!rosterResponse.ok) return CHAMPIONS;
    const body = (await rosterResponse.json()) as { data?: Record<string, { id?: string; name?: string }> };
    const champions = Object.values(body.data ?? {})
      .filter((entry): entry is { id: string; name: string } => Boolean(entry.id && entry.name))
      .map((entry) => championFromDataDragon(version, entry.id, entry.name))
      .sort((a, b) => a.name.localeCompare(b.name));

    // A truncated payload must never shrink the pool below the known roster.
    return champions.length >= CHAMPIONS.length ? champions : CHAMPIONS;
  } catch {
    return CHAMPIONS;
  }
}
