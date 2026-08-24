import { normalizeCanonicalName } from "@/lib/players/canonicalMatch";
import type { LolRole } from "@/lib/draft/types";

export interface InhouseGameRow {
  summoner_name: string | null;
  champion: string | null;
  kills: number;
  deaths: number;
  assists: number;
  win: boolean;
}

export interface InhouseChampionStat {
  champion: string;
  games: number;
  wins: number;
  winrate_pct: number;
  avg_kda: number;
}

export interface InhousePlayerStats {
  playerId: string;
  playerName: string;
  role: LolRole;
  games: number;
  champions: InhouseChampionStat[];
}

interface RosterPlayer {
  id: string;
  displayName: string;
  role: LolRole;
}

/** Match all available in-house rows to the current roster and group picks by champion. */
export function buildInhousePlayerStats(roster: RosterPlayer[], rows: InhouseGameRow[]): InhousePlayerStats[] {
  const rowsByPlayer = new Map<string, InhouseGameRow[]>();
  const rosterByName = new Map(roster.map((player) => [normalizeCanonicalName(player.displayName), player]));

  for (const row of rows) {
    if (!row.summoner_name) continue;
    const player = rosterByName.get(normalizeCanonicalName(row.summoner_name));
    if (!player) continue;
    rowsByPlayer.set(player.id, [...(rowsByPlayer.get(player.id) ?? []), row]);
  }

  return roster.map((player) => {
    const playerRows = rowsByPlayer.get(player.id) ?? [];
    const groups = new Map<string, { games: number; wins: number; kills: number; deaths: number; assists: number }>();
    for (const row of playerRows) {
      if (!row.champion) continue;
      const group = groups.get(row.champion) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
      group.games += 1;
      group.wins += row.win ? 1 : 0;
      group.kills += row.kills;
      group.deaths += row.deaths;
      group.assists += row.assists;
      groups.set(row.champion, group);
    }

    const champions = [...groups.entries()]
      .map(([champion, group]) => ({
        champion,
        games: group.games,
        wins: group.wins,
        winrate_pct: Number((100 * group.wins / group.games).toFixed(1)),
        avg_kda: Number(((group.kills + group.assists) / Math.max(group.deaths, 1)).toFixed(2)),
      }))
      .sort((a, b) => b.games - a.games || b.winrate_pct - a.winrate_pct || a.champion.localeCompare(b.champion));

    return { playerId: player.id, playerName: player.displayName.trim(), role: player.role, games: playerRows.length, champions };
  });
}
