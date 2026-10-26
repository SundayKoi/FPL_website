// Weekly offseason MVP. Staff nominate two to five of a week's players;
// anyone signed in votes for one of them, never themselves, and a week's
// count shows once voting on it closes
// (supabase/migrations/20261113000002_offseason_mvp_votes.sql,
// 20261118000001_offseason_mvp_nominees.sql). The database decides which week
// is open and who can be voted for; this only shapes what it returns, with
// each nominee's numbers for the week.

import type { SupabaseClient } from "@supabase/supabase-js";
import { cardPlayerKey } from "@/lib/cards/cardKeys";
import type { LolRole } from "@/lib/draft/types";
import { entrantKey } from "./ratings";
import { rowsOf, summarizeRows, type StatLine } from "./stats";
import type { OffseasonView } from "./view";

export interface MvpResultRow {
  week_id: string;
  entrant_id: string | null;
  votes: number;
  final: boolean;
}

export interface MvpNomineeRow {
  week_id: string;
  entrant_id: string;
  position: number;
}

/** A player's week in numbers, from their ingested games (subs' games included). */
export interface WeekLine extends StatLine {
  /** Their Overall for the week alone; null before an ingested game. */
  overall: number | null;
}

export interface MvpNominee {
  entrantId: string;
  name: string;
  role: LolRole;
  teamName: string;
  /** The viewer's own entry, which they can't vote for. */
  self: boolean;
  line: WeekLine;
}

export interface MvpOpenWeek {
  weekId: string;
  weekNumber: number;
  /** How many have voted so far. */
  total: number;
  /** The entrant the viewer voted for, if they have. */
  myVote: string | null;
  /** In staff's order; empty until staff nominate. */
  nominees: MvpNominee[];
  /** Staff's deadline for the vote; null when it runs until the next week is complete. */
  closesAt: string | null;
}

export interface MvpWinner {
  weekNumber: number;
  /** More than one on a tie. */
  names: { entrantId: string; name: string }[];
  votes: number;
  total: number;
}

export interface MvpState {
  open: MvpOpenWeek | null;
  /** Closed weeks with at least one vote, newest first. */
  winners: MvpWinner[];
}

/** Every player on the week's teams, with their numbers for that week. */
export function weekLines(view: OffseasonView, weekId: string): Map<string, WeekLine> {
  const week = view.weekById.get(weekId);
  const rows = week ? rowsOf(view, week.week_number) : [];
  const lines = new Map<string, WeekLine>();
  for (const team of view.teams.filter((candidate) => candidate.week_id === weekId)) {
    for (const member of view.membersByTeam.get(team.id) ?? []) {
      const entrant = view.entrantsById.get(member.entrant_id);
      const key = entrant ? entrantKey(entrant.riot_id) : null;
      const own = key ? rows.filter((row) => cardPlayerKey(row.summoner_name, row.tag) === key) : [];
      lines.set(member.entrant_id, {
        overall: (week && view.ratings.get(member.entrant_id)?.weekly.find((line) => line.week === week.week_number)?.overall) ?? null,
        ...summarizeRows(own),
      });
    }
  }
  return lines;
}

/** A week's nominees in staff's order, each with their week. */
export function mvpNominees(view: OffseasonView, weekId: string, nominees: MvpNomineeRow[], userId: string | null): MvpNominee[] {
  const lines = weekLines(view, weekId);
  const teamOf = new Map(
    view.teams.filter((team) => team.week_id === weekId).flatMap((team) => (view.membersByTeam.get(team.id) ?? []).map((member) => [member.entrant_id, { team, member }] as const)),
  );
  return nominees
    .filter((row) => row.week_id === weekId)
    .sort((a, b) => a.position - b.position)
    .flatMap((row) => {
      const entrant = view.entrantsById.get(row.entrant_id);
      const place = teamOf.get(row.entrant_id);
      const line = lines.get(row.entrant_id);
      if (!entrant || !place || !line) return [];
      return [{
        entrantId: entrant.id,
        name: entrant.display_name,
        role: place.member.role,
        teamName: place.team.name,
        self: userId !== null && entrant.profile_id === userId,
        line,
      }];
    });
}

export function buildMvpState(
  view: OffseasonView,
  rows: MvpResultRow[],
  myVotes: { week_id: string; entrant_id: string }[],
  userId: string | null,
  nominees: MvpNomineeRow[] = [],
): MvpState {
  const openRow = rows.find((row) => !row.final);
  const openWeek = openRow ? view.weekById.get(openRow.week_id) : undefined;
  const open: MvpOpenWeek | null =
    openRow && openWeek
      ? {
          weekId: openWeek.id,
          weekNumber: openWeek.week_number,
          total: openRow.votes,
          myVote: myVotes.find((vote) => vote.week_id === openWeek.id)?.entrant_id ?? null,
          nominees: mvpNominees(view, openWeek.id, nominees, userId),
          closesAt: openWeek.mvp_closes_at ?? null,
        }
      : null;

  const byWeek = new Map<string, MvpResultRow[]>();
  for (const row of rows) {
    if (!row.final || !row.entrant_id) continue;
    byWeek.set(row.week_id, [...(byWeek.get(row.week_id) ?? []), row]);
  }
  const winners = [...byWeek].flatMap(([weekId, weekRows]) => {
    const week = view.weekById.get(weekId);
    if (!week) return [];
    const top = Math.max(...weekRows.map((row) => row.votes));
    const names = weekRows
      .filter((row) => row.votes === top)
      .map((row) => ({ entrantId: row.entrant_id!, name: view.entrantsById.get(row.entrant_id!)?.display_name ?? "Former player" }))
      .sort((a, b) => a.name.localeCompare(b.name));
    return [{ weekNumber: week.week_number, names, votes: top, total: weekRows.reduce((sum, row) => sum + row.votes, 0) }];
  });
  winners.sort((a, b) => b.weekNumber - a.weekNumber);

  return { open, winners };
}

/** The event's MVP voting as the viewer sees it. */
export async function loadMvp(supabase: SupabaseClient, view: OffseasonView, userId: string | null): Promise<MvpState> {
  const [results, mine, nominees] = await Promise.all([
    supabase.rpc("offseason_mvp_results", { p_event_id: view.event.id }),
    userId
      ? supabase.from("offseason_mvp_votes").select("week_id, entrant_id").eq("voter_id", userId)
      : Promise.resolve({ data: [], error: null }),
    fetchMvpNominees(supabase, view.weeks.map((week) => week.id)),
  ]);
  if (results.error) throw new Error(`offseason MVP read failed: ${results.error.message}`);
  if (mine.error) throw new Error(`offseason MVP vote read failed: ${mine.error.message}`);
  return buildMvpState(
    view,
    (results.data as MvpResultRow[] | null) ?? [],
    (mine.data as { week_id: string; entrant_id: string }[] | null) ?? [],
    userId,
    nominees,
  );
}

/** The nominees of these weeks; anyone reads them. */
export async function fetchMvpNominees(supabase: SupabaseClient, weekIds: string[]): Promise<MvpNomineeRow[]> {
  if (weekIds.length === 0) return [];
  const { data, error } = await supabase.from("offseason_mvp_nominees").select("week_id, entrant_id, position").in("week_id", weekIds);
  if (error) throw new Error(`offseason MVP nominees read failed: ${error.message}`);
  return (data as MvpNomineeRow[] | null) ?? [];
}
