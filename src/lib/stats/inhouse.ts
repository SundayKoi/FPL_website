export interface InhouseChampionGame {
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

/** Aggregate only champion picks for one player's in-house game rows. */
export function aggregateInhouseChampionStats(rows: InhouseChampionGame[]): InhouseChampionStat[] {
  const groups = new Map<string, { games: number; wins: number; kills: number; deaths: number; assists: number }>();

  for (const row of rows) {
    if (!row.champion) continue;
    const group = groups.get(row.champion) ?? { games: 0, wins: 0, kills: 0, deaths: 0, assists: 0 };
    group.games += 1;
    group.wins += row.win ? 1 : 0;
    group.kills += row.kills;
    group.deaths += row.deaths;
    group.assists += row.assists;
    groups.set(row.champion, group);
  }

  return [...groups.entries()]
    .map(([champion, group]) => ({
      champion,
      games: group.games,
      wins: group.wins,
      winrate_pct: Number((100 * group.wins / group.games).toFixed(1)),
      avg_kda: Number(((group.kills + group.assists) / Math.max(group.deaths, 1)).toFixed(2)),
    }))
    .sort((a, b) => b.games - a.games || b.winrate_pct - a.winrate_pct || a.champion.localeCompare(b.champion));
}
