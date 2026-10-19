// Tournament codes: reading a pasted batch, counting the games still short
// of one, and laying out a player's own matches with theirs. The database
// hands the codes out (_offseason_fill_match_codes in
// 20261117000001_offseason_match_codes.sql); this only mirrors its rules so
// the pages can show them.

import { matchRounds } from "./schedule";
import {
  STAGE_LABELS,
  type OffseasonEventData,
  type OffseasonMatch,
  type OffseasonMatchCode,
  type OffseasonTeam,
  type OffseasonWeek,
} from "./types";
import type { OffseasonView } from "./view";

/** The codes in a paste: whatever sits between spaces, commas or line breaks. */
export function parseCodes(text: string): string[] {
  return text.split(/[\s,;]+/).filter(Boolean);
}

/**
 * How many games still need a code: every game of an undecided match in a
 * week still to finish that has neither a code nor a result.
 */
export function gamesNeedingCodes(
  data: Pick<OffseasonEventData, "event" | "weeks" | "matches" | "games">,
  codes: OffseasonMatchCode[],
): number {
  if (data.event.status === "complete") return 0;
  const openWeeks = new Set(data.weeks.filter((week) => week.status !== "complete").map((week) => week.id));
  const taken = new Set([
    ...codes.filter((code) => code.match_id).map((code) => `${code.match_id}:${code.game_number}`),
    ...data.games.map((game) => `${game.match_id}:${game.game_number}`),
  ]);
  let count = 0;
  for (const match of data.matches) {
    if (!openWeeks.has(match.week_id) || match.winner_team_id) continue;
    for (let game = 1; game <= match.best_of; game += 1) {
      if (!taken.has(`${match.id}:${game}`)) count += 1;
    }
  }
  return count;
}

/** The team an entrant plays for in a week, with that team's matches; null if they don't play. */
export function weekTeam(
  view: OffseasonView,
  week: OffseasonWeek,
  entrantId: string,
): { team: OffseasonTeam; matches: OffseasonMatch[] } | null {
  const team = view.teams.find(
    (candidate) =>
      candidate.week_id === week.id && (view.membersByTeam.get(candidate.id) ?? []).some((member) => member.entrant_id === entrantId),
  );
  if (!team) return null;
  return {
    team,
    matches: view.matches.filter((match) => match.week_id === week.id && (match.team_a_id === team.id || match.team_b_id === team.id)),
  };
}

export interface MatchCodeGame {
  gameNumber: number;
  code: string | null;
  played: boolean;
}

/** One of a team's matches as its players see it. Plain data, for the client. */
export interface TeamMatchCodes {
  matchId: string;
  /** "Round robin · Game 2", or the stage and length for a series. */
  label: string;
  opponent: string;
  side: "blue" | "red";
  result: "won" | "lost" | null;
  /** Games won, the team's own first. */
  score: [number, number];
  games: MatchCodeGame[];
}

/** Each of a team's matches with its code for every game, in schedule order. */
export function teamMatchCodes(
  view: OffseasonView,
  team: OffseasonTeam,
  matches: OffseasonMatch[],
  codes: OffseasonMatchCode[],
): TeamMatchCodes[] {
  // A round robin match is labelled by its round, as the schedule groups them.
  const weekRoundRobin = view.matches.filter((match) => match.week_id === team.week_id && match.stage === "round_robin");
  const round = new Map(matchRounds(weekRoundRobin).flatMap((games, index) => games.map((match) => [match.id, index + 1] as const)));

  return [...matches]
    .sort((a, b) => a.sort_order - b.sort_order)
    .map((match) => {
      const blue = match.team_a_id === team.id;
      const opponentId = blue ? match.team_b_id : match.team_a_id;
      const games = view.gamesByMatch.get(match.id) ?? [];
      return {
        matchId: match.id,
        label:
          match.stage === "round_robin" && round.has(match.id)
            ? `${STAGE_LABELS.round_robin} · Game ${round.get(match.id)}`
            : `${STAGE_LABELS[match.stage]} · Bo${match.best_of}`,
        opponent: view.teamsById.get(opponentId)?.name ?? "TBD",
        side: blue ? "blue" : "red",
        result: !match.winner_team_id ? null : match.winner_team_id === team.id ? "won" : "lost",
        score: [
          games.filter((game) => game.winner_team_id === team.id).length,
          games.filter((game) => game.winner_team_id === opponentId).length,
        ],
        games: Array.from({ length: match.best_of }, (_, index) => ({
          gameNumber: index + 1,
          code: codes.find((code) => code.match_id === match.id && code.game_number === index + 1)?.code ?? null,
          played: games.some((game) => game.game_number === index + 1),
        })),
      };
    });
}
