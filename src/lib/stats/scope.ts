import { normalizeTeamName } from "@/lib/league/context";

export function playerStatKey(row: { summoner_name: string; tag: string }): string {
  return `${row.summoner_name}#${row.tag}`.trim().toLowerCase();
}

export function filterStatsRowsByPlayerKeys<T extends { summoner_name: string; tag: string }>(rows: T[], keys: Set<string>): T[] {
  return rows.filter((row) => keys.has(playerStatKey(row)));
}

export function filterTimelineRowsByTeams<T extends { blue_team: string; red_team: string }>(rows: T[], teamNames: Set<string>): T[] {
  return rows.filter((row) => teamNames.has(normalizeTeamName(row.blue_team)) || teamNames.has(normalizeTeamName(row.red_team)));
}
