/**
 * Resolve a free-text player reference (a roster display name, or a
 * "Name#TAG" deep-link param) against stats_player_agg identities.
 *
 * Roster names come from the draft player pool and are not guaranteed to
 * carry a #TAG, so matching is two-step:
 * 1. If the query contains "#", split at the LAST "#" and require an exact
 *    case-insensitive match on both name and tag.
 * 2. Otherwise match on name alone — but only when exactly one distinct
 *    identity has that name (raw_stats has shared-name pairs like
 *    Aura#5950 vs Aura#RGB0, which a bare name cannot disambiguate).
 *
 * Returns null when nothing (or more than one thing) matches; callers fall
 * back to a search instead of guessing.
 */
export function resolvePlayerParam(
  rows: { summoner_name: string; tag: string }[],
  query: string,
): { summonerName: string; tag: string } | null {
  const trimmed = query.trim();
  if (!trimmed) return null;

  const uniqueByName = (name: string) => {
    const lower = name.toLowerCase();
    const identities = new Map<string, { summonerName: string; tag: string }>();
    for (const r of rows) {
      if (r.summoner_name.toLowerCase() !== lower) continue;
      identities.set(`${r.summoner_name.toLowerCase()}#${r.tag.toLowerCase()}`, {
        summonerName: r.summoner_name,
        tag: r.tag,
      });
    }
    return identities.size === 1 ? identities.values().next().value! : null;
  };

  const hashIndex = trimmed.lastIndexOf("#");
  if (hashIndex > 0) {
    const name = trimmed.slice(0, hashIndex);
    const tag = trimmed.slice(hashIndex + 1).toLowerCase();
    const hit = rows.find(
      (r) => r.summoner_name.toLowerCase() === name.toLowerCase() && r.tag.toLowerCase() === tag,
    );
    if (hit) return { summonerName: hit.summoner_name, tag: hit.tag };
    // Stale tag but unambiguous name half, or a "#" that's part of the
    // name itself — try both interpretations as bare names.
    return uniqueByName(name) ?? uniqueByName(trimmed);
  }

  return uniqueByName(trimmed);
}
