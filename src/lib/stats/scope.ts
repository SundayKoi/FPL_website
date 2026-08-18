import { normalizeTeamName } from "@/lib/league/context";

/** Case-preserving `Name#TAG` identity key for a stats row (display/grouping). */
export function playerKey(row: { summoner_name: string; tag: string }): string {
  return `${row.summoner_name}#${row.tag}`;
}

/** Lowercased `playerKey` for case-insensitive membership checks. */
export function playerStatKey(row: { summoner_name: string; tag: string }): string {
  return playerKey(row).trim().toLowerCase();
}

export function filterStatsRowsByPlayerKeys<T extends { summoner_name: string; tag: string }>(rows: T[], keys: Set<string>): T[] {
  return rows.filter((row) => keys.has(playerStatKey(row)));
}

export function filterTimelineRowsByTeams<T extends { blue_team: string; red_team: string }>(rows: T[], teamNames: Set<string>): T[] {
  return rows.filter((row) => teamNames.has(normalizeTeamName(row.blue_team)) || teamNames.has(normalizeTeamName(row.red_team)));
}

/**
 * Narrow the seasons present in the data to the ones this page's league owns.
 * `allowed` wins over `excluded`; when nothing in the data matches `allowed`
 * (a league whose first games are not ingested yet) the allowed list itself is
 * used, so the picker shows the league's season instead of going blank.
 */
export function scopeSeasons(
  seasons: string[],
  allowed?: string[],
  excluded?: string[],
): string[] {
  let scoped = seasons;
  if (allowed?.length) {
    const allow = new Set(allowed);
    scoped = seasons.filter((season) => allow.has(season));
    if (scoped.length === 0) scoped = allowed.filter(Boolean);
  }
  if (excluded?.length) {
    const deny = new Set(excluded.filter(Boolean));
    scoped = scoped.filter((season) => !deny.has(season));
  }
  return scoped;
}
