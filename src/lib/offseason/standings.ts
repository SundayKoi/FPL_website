// Team records from match and game results.

import type { OffseasonGame, OffseasonMatch, OffseasonTeam } from "./types";

export interface TeamStanding {
  team: OffseasonTeam;
  played: number;
  wins: number;
  losses: number;
  gameWins: number;
  gameLosses: number;
}

/** Records for `teams`, best first: match wins, then game difference. */
export function standings(teams: OffseasonTeam[], matches: OffseasonMatch[], games: OffseasonGame[]): TeamStanding[] {
  const rows = new Map(teams.map((team) => [team.id, { team, played: 0, wins: 0, losses: 0, gameWins: 0, gameLosses: 0 }]));
  const matchById = new Map(matches.map((match) => [match.id, match]));

  for (const match of matches) {
    if (!match.winner_team_id) continue;
    const loser = match.winner_team_id === match.team_a_id ? match.team_b_id : match.team_a_id;
    const winnerRow = rows.get(match.winner_team_id);
    const loserRow = rows.get(loser);
    if (winnerRow) {
      winnerRow.played += 1;
      winnerRow.wins += 1;
    }
    if (loserRow) {
      loserRow.played += 1;
      loserRow.losses += 1;
    }
  }
  for (const game of games) {
    const match = matchById.get(game.match_id);
    if (!match || !game.winner_team_id) continue;
    const loser = game.winner_team_id === match.team_a_id ? match.team_b_id : match.team_a_id;
    const winnerRow = rows.get(game.winner_team_id);
    const loserRow = rows.get(loser);
    if (winnerRow) winnerRow.gameWins += 1;
    if (loserRow) loserRow.gameLosses += 1;
  }

  return [...rows.values()].sort(
    (a, b) =>
      b.wins - a.wins ||
      a.losses - b.losses ||
      b.gameWins - b.gameLosses - (a.gameWins - a.gameLosses) ||
      a.team.name.localeCompare(b.team.name),
  );
}

/**
 * Elimination-tier teams that lost: in a paired week the loser of each
 * pairing, in an odd-sized round robin the teams with a losing record. A
 * suggestion — staff confirm each elimination.
 */
export function suggestedEliminations(
  teams: OffseasonTeam[],
  matches: OffseasonMatch[],
  games: OffseasonGame[],
): OffseasonTeam[] {
  const eliminationTeams = teams.filter((team) => team.tier === "elimination");
  const eliminationMatches = matches.filter((match) => match.stage === "elimination");
  if (eliminationMatches.length === 0 || eliminationMatches.some((match) => !match.winner_team_id)) return [];
  return standings(eliminationTeams, eliminationMatches, games)
    .filter((row) => row.losses > row.wins)
    .map((row) => row.team);
}
