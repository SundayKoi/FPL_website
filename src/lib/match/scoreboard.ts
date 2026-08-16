/** Shapes raw_stats rows — one per player per game, written by the nightly
 *  ingest — into the end-of-game scoreboards a series is made of. */

export interface RawStatRow {
  match_id: string | null;
  game_date: string | null;
  game_duration_min: number | null;
  team_side: string | null;
  team_name: string | null;
  summoner_name: string | null;
  champion: string | null;
  role: string | null;
  kills: number | null;
  deaths: number | null;
  assists: number | null;
  cs: number | null;
  gold_earned: number | null;
  total_damage_to_champions: number | null;
  vision_score: number | null;
  win: boolean | null;
}

export interface ScoreboardPlayer {
  summonerName: string;
  champion: string;
  role: string;
  kills: number;
  deaths: number;
  assists: number;
  cs: number;
  gold: number;
  damage: number;
  visionScore: number;
}

export interface ScoreboardSide {
  side: string;
  teamName: string;
  won: boolean;
  players: ScoreboardPlayer[];
  totals: { kills: number; deaths: number; assists: number; gold: number; damage: number };
}

export interface ScoreboardGame {
  matchId: string;
  gameNumber: number;
  durationMin: number | null;
  playedAt: string | null;
  sides: ScoreboardSide[];
}

// Riot's position names and the league's own role names both turn up in
// raw_stats depending on ingest vintage, so both map to the same order.
const ROLE_RANK: Record<string, number> = {
  top: 0,
  jungle: 1,
  middle: 2, mid: 2,
  bottom: 3, adc: 3,
  utility: 4, support: 4,
};

function roleRank(role: string): number {
  return ROLE_RANK[role.trim().toLowerCase()] ?? 99;
}

const num = (v: number | null | undefined) => v ?? 0;

/** Games in the order they were played, each with its two sides. Rows whose
 *  match id is missing are skipped — they cannot belong to a game. */
export function buildScoreboard(rows: RawStatRow[]): ScoreboardGame[] {
  const byMatch = new Map<string, RawStatRow[]>();
  for (const row of rows) {
    if (!row.match_id) continue;
    const list = byMatch.get(row.match_id);
    if (list) list.push(row);
    else byMatch.set(row.match_id, [row]);
  }

  const games = [...byMatch.entries()].map(([matchId, matchRows]) => {
    const bySide = new Map<string, RawStatRow[]>();
    for (const row of matchRows) {
      const side = row.team_side?.trim() || "Unknown";
      const list = bySide.get(side);
      if (list) list.push(row);
      else bySide.set(side, [row]);
    }

    const sides: ScoreboardSide[] = [...bySide.entries()]
      // Blue first, the way the client shows it.
      .sort((a, b) => (a[0] === "Blue" ? -1 : b[0] === "Blue" ? 1 : a[0].localeCompare(b[0])))
      .map(([side, sideRows]) => {
        const players = sideRows
          .map((r) => ({
            summonerName: r.summoner_name ?? "Unknown",
            champion: r.champion ?? "—",
            role: r.role ?? "",
            kills: num(r.kills),
            deaths: num(r.deaths),
            assists: num(r.assists),
            cs: num(r.cs),
            gold: num(r.gold_earned),
            damage: num(r.total_damage_to_champions),
            visionScore: num(r.vision_score),
          }))
          .sort((a, b) => roleRank(a.role) - roleRank(b.role) ||
                          a.summonerName.localeCompare(b.summonerName));

        return {
          side,
          teamName: sideRows.find((r) => r.team_name)?.team_name ?? "Unknown",
          // Every row on a side carries the same result; one is enough.
          won: sideRows.some((r) => r.win === true),
          players,
          totals: {
            kills: players.reduce((s, p) => s + p.kills, 0),
            deaths: players.reduce((s, p) => s + p.deaths, 0),
            assists: players.reduce((s, p) => s + p.assists, 0),
            gold: players.reduce((s, p) => s + p.gold, 0),
            damage: players.reduce((s, p) => s + p.damage, 0),
          },
        };
      });

    const durations = matchRows.map((r) => r.game_duration_min).filter((d): d is number => d != null);
    const dates = matchRows.map((r) => r.game_date).filter((d): d is string => !!d).sort();

    return {
      matchId,
      gameNumber: 0, // assigned once every game is ordered
      durationMin: durations.length ? durations[0] : null,
      playedAt: dates[0] ?? null,
      sides,
    };
  });

  return games
    .sort((a, b) =>
      (a.playedAt ?? "").localeCompare(b.playedAt ?? "") || a.matchId.localeCompare(b.matchId)
    )
    .map((g, i) => ({ ...g, gameNumber: i + 1 }));
}

/** Series tally by team name, for the header above the per-game tables. */
export function seriesRecord(games: ScoreboardGame[]): Record<string, number> {
  const wins: Record<string, number> = {};
  for (const game of games) {
    for (const side of game.sides) {
      if (side.won) wins[side.teamName] = (wins[side.teamName] ?? 0) + 1;
    }
  }
  return wins;
}
