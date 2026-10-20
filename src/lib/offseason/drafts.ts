// Champion drafts for the event's matches: the league's pick/ban board,
// pointed at offseason_match_drafts (20261119000001). The two captains draft;
// the board, the RPCs and the history read the same rows.

import type { SupabaseClient } from "@supabase/supabase-js";
import type { DraftSummaryGame } from "@/components/matches/MatchDraftSummary";
import { ROLE_ORDER } from "@/lib/draft/types";
import { fearlessBlockedByGame, fearlessBlockedChampions } from "@/lib/match-draft/rules";
import type { MatchDraftAction, MatchDraftGameTab, MatchDraftLayout, MatchDraftRow, MatchDraftState, MatchDraftTeam } from "@/lib/match-draft/types";
import { STAGE_LABELS, type OffseasonMatch, type OffseasonTeam } from "./types";
import type { OffseasonView } from "./view";

/** An offseason_match_drafts row: a match_drafts row keyed by offseason match. */
export interface OffseasonDraftRow extends Omit<MatchDraftRow, "fixture_id" | "layout"> {
  match_id: string;
}

export const draftHref = (matchId: string, gameNumber?: number) =>
  `/offseason/draft/${matchId}${gameNumber ? `?game=${gameNumber}` : ""}`;
export const matchHref = (matchId: string) => `/offseason/matches/${matchId}`;

export async function fetchMatchDrafts(supabase: SupabaseClient, matchIds: string[]): Promise<OffseasonDraftRow[]> {
  if (matchIds.length === 0) return [];
  const { data, error } = await supabase.from("offseason_match_drafts").select("*").in("match_id", matchIds).order("game_number");
  if (error) throw new Error(`offseason drafts read failed: ${error.message}`);
  return (data as OffseasonDraftRow[] | null) ?? [];
}

const drafted = (row: OffseasonDraftRow) =>
  (row.actions ?? []).filter((action): action is MatchDraftAction => Boolean(action && (action.champion || action.skipped)));

/**
 * "Team Doki" shows as DOKI where the board is short of room: the first word
 * after "Team", eight letters at most.
 */
export function teamAbbreviation(name: string): string {
  const word = name.replace(/^team\s+/i, "").trim().split(/\s+/)[0] || name;
  return word.slice(0, 8).toUpperCase();
}

/** A team as the board shows it: its players top to support. */
export function draftTeam(view: OffseasonView, team: OffseasonTeam | undefined, side: "Blue" | "Red"): MatchDraftTeam {
  if (!team) return { name: `${side} side`, abbreviation: side.toUpperCase(), imageUrl: null, players: [] };
  const players = [...(view.membersByTeam.get(team.id) ?? [])]
    .sort((a, b) => ROLE_ORDER.indexOf(a.role) - ROLE_ORDER.indexOf(b.role))
    .map((member) => view.entrantsById.get(member.entrant_id)?.display_name ?? "?");
  return { name: team.name, abbreviation: teamAbbreviation(team.name), imageUrl: null, players };
}

/** Which of the match's teams the viewer captains, by the account their entry is linked to. */
export function viewerCaptainOf(view: OffseasonView, match: OffseasonMatch, userId: string | null): OffseasonTeam | null {
  if (!userId) return null;
  for (const teamId of [match.team_a_id, match.team_b_id]) {
    const team = view.teamsById.get(teamId);
    const captain = team?.captain_entrant_id ? view.entrantsById.get(team.captain_entrant_id) : undefined;
    if (team && captain?.profile_id === userId) return team;
  }
  return null;
}

/** "Week 2 · Elimination · Bo5" for the history; the board shows the length itself. */
export function matchLabel(view: OffseasonView, match: OffseasonMatch, withLength = true): string {
  const week = view.weekById.get(match.week_id);
  return [week ? `Week ${week.week_number}` : null, STAGE_LABELS[match.stage], withLength ? `Bo${match.best_of}` : null]
    .filter(Boolean)
    .join(" · ");
}

/** Every game of the match as the board starts it, fearless across the match. */
export function draftStates({
  view,
  match,
  rows,
  layout,
}: {
  view: OffseasonView;
  match: OffseasonMatch;
  rows: OffseasonDraftRow[];
  layout: MatchDraftLayout;
}): { states: MatchDraftState[]; games: MatchDraftGameTab[] } {
  const scheduledTeams: [MatchDraftTeam, MatchDraftTeam] = [
    draftTeam(view, view.teamsById.get(match.team_a_id), "Blue"),
    draftTeam(view, view.teamsById.get(match.team_b_id), "Red"),
  ];
  const byName = (name: string | null | undefined, fallback: MatchDraftTeam) =>
    scheduledTeams.find((team) => team.name.trim().toLowerCase() === name?.trim().toLowerCase()) ?? fallback;
  const prior = rows.map((row) => ({ gameNumber: row.game_number, actions: drafted(row) }));

  const states = Array.from({ length: match.best_of }, (_, index): MatchDraftState => {
    const gameNumber = index + 1;
    const row = rows.find((candidate) => candidate.game_number === gameNumber) ?? null;
    const actions = row ? drafted(row) : [];
    return {
      fixtureId: match.id,
      gameNumber,
      revision: row?.revision,
      status: row?.status ?? "drafting",
      layout,
      currentStepIndex: row?.current_step_index ?? 0,
      turnStartedAt: row?.turn_started_at ?? null,
      turnDeadlineAt: row?.turn_deadline_at ?? null,
      turnAllowanceSeconds: row?.turn_allowance_seconds ?? null,
      bluePendingOvertimeSeconds: row?.blue_pending_overtime_seconds ?? 0,
      redPendingOvertimeSeconds: row?.red_pending_overtime_seconds ?? 0,
      blueTeam: byName(row?.blue_team_name, scheduledTeams[0]),
      redTeam: byName(row?.red_team_name, scheduledTeams[1]),
      scheduledTeams,
      // As in the league: sides can be swapped before a game's first action,
      // and games 2+ need the choice (the previous game's loser picks).
      canChooseSides: actions.length === 0,
      sideChoiceRequired: gameNumber > 1 && actions.length === 0 && !(row?.blue_team_name && row?.red_team_name),
      blueReady: row?.blue_ready ?? false,
      redReady: row?.red_ready ?? false,
      changeRequest: row?.change_request ?? null,
      positions: row?.positions ?? null,
      winnerTeam: row?.winner_team ?? null,
      actions,
      blockedChampions: [...fearlessBlockedChampions(prior, gameNumber)],
      blockedGames: fearlessBlockedByGame(prior, gameNumber),
    };
  });
  const games = states.map((state) => ({
    gameNumber: state.gameNumber,
    href: draftHref(match.id, state.gameNumber),
    status: rows.find((row) => row.game_number === state.gameNumber)?.status ?? null,
  }));
  return { states, games };
}

/** The match's drafted games for the history, with each game's real winner when it's in. */
export function draftSummaryGames(view: OffseasonView, match: OffseasonMatch, rows: OffseasonDraftRow[]): DraftSummaryGame[] {
  const teamA = view.teamsById.get(match.team_a_id)?.name ?? null;
  const teamB = view.teamsById.get(match.team_b_id)?.name ?? null;
  const results = view.gamesByMatch.get(match.id) ?? [];
  return rows
    .filter((row) => row.match_id === match.id)
    .sort((a, b) => a.game_number - b.game_number)
    .map((row) => {
      const winnerId = results.find((game) => game.game_number === row.game_number)?.winner_team_id;
      const blue = row.blue_team_name ?? teamA;
      const red = row.red_team_name ?? teamB;
      return {
        gameNumber: row.game_number,
        blueTeamName: blue,
        redTeamName: red,
        blueAbbreviation: blue ? teamAbbreviation(blue) : null,
        redAbbreviation: red ? teamAbbreviation(red) : null,
        winnerTeam: (winnerId ? view.teamsById.get(winnerId)?.name : null) ?? row.winner_team ?? null,
        actions: drafted(row),
        positions: row.positions ?? null,
      };
    });
}
