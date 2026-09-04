// Forfeited games in a team's record.
//
// Every number on the stats page comes from raw_stats, which only knows
// games Riot has a match id for. A series that ended in a forfeit reports
// its full score (say 2-1) but lists only the games actually played (two),
// so the conceded game exists nowhere in stats — and a team that was 3-4 on
// the schedule reads 2-4 here. The report knows who conceded
// (match_reports.forfeit_team_id) and what the score was; the gap between
// the score and the games played IS the forfeit. This turns that gap into
// wins and losses and lays them over the aggregate rows. Nothing else on
// the row changes: dragon rate, kills, duration are per game played, and
// nobody played these.

import type { TeamAggRow } from "./types";

export interface ForfeitReport {
  id: string;
  season: string;
  season_phase: string;
  team_a_name: string;
  team_b_name: string;
  score_a: number;
  score_b: number;
  /** The conceding side's name. */
  forfeit_team_name: string;
  /** Games in the report with a real match id — the ones that were played. */
  games_played: number;
}

export interface ForfeitRecord {
  season: string;
  season_phase: string;
  winner: string;
  loser: string;
  games: number;
}

/** The games a forfeit stands in for: the reported score minus the games
 *  that were actually played, credited to the side that did not concede.
 *  Never negative — an over-reported games list is somebody else's warning. */
export function forfeitRecord(report: ForfeitReport): ForfeitRecord | null {
  const games = Math.max(0, report.score_a + report.score_b - report.games_played);
  if (games === 0) return null;
  const aConceded = report.forfeit_team_name === report.team_a_name;
  return {
    season: report.season,
    season_phase: report.season_phase,
    winner: aConceded ? report.team_b_name : report.team_a_name,
    loser: report.forfeit_team_name,
    games,
  };
}

/**
 * Lay forfeits over aggregate rows. Rows are matched by team; when the
 * rows have already been merged across seasons or phases (the tab does
 * that first), every forfeit for the team applies. A team with forfeits
 * but no played games gets a row of zero rates so the record still shows.
 * Win rate is recomputed over all games, played and conceded — a forfeit
 * win counts in the standings, so it counts here.
 */
export function applyForfeits(rows: TeamAggRow[], forfeits: ForfeitRecord[], seasonLabel?: string): TeamAggRow[] {
  if (forfeits.length === 0) return rows;
  const byTeam = new Map(rows.map((row) => [row.team_name, { ...row, forfeit_wins: 0, forfeit_losses: 0 } as TeamAggRow]));
  const blank = (team: string, season: string, phase: string): TeamAggRow => ({
    team_name: team,
    season: seasonLabel ?? season,
    season_phase: phase,
    games: 0,
    wins: 0,
    losses: 0,
    winrate_pct: 0,
    avg_duration_min: 0,
    dragon_rate: 0,
    baron_rate: 0,
    first_blood_rate: 0,
    first_tower_rate: 0,
    avg_team_kills: 0,
    forfeit_wins: 0,
    forfeit_losses: 0,
  });
  const credit = (team: string, forfeit: ForfeitRecord, won: boolean) => {
    const row = byTeam.get(team) ?? blank(team, forfeit.season, forfeit.season_phase);
    row.games += forfeit.games;
    if (won) {
      row.wins += forfeit.games;
      row.forfeit_wins = (row.forfeit_wins ?? 0) + forfeit.games;
    } else {
      row.losses += forfeit.games;
      row.forfeit_losses = (row.forfeit_losses ?? 0) + forfeit.games;
    }
    row.winrate_pct = row.games === 0 ? 0 : Math.round(((100 * row.wins) / row.games) * 10) / 10;
    byTeam.set(team, row);
  };
  for (const forfeit of forfeits) {
    credit(forfeit.winner, forfeit, true);
    credit(forfeit.loser, forfeit, false);
  }
  return [...byTeam.values()];
}
