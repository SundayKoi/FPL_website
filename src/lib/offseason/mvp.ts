// Weekly offseason MVP. Anyone signed in votes for one of the open week's
// players, never themselves, and a week's count shows once voting on it
// closes (supabase/migrations/20261113000002_offseason_mvp_votes.sql). The
// database decides which week is open; this only shapes what it returns.

import type { SupabaseClient } from "@supabase/supabase-js";
import { ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import type { OffseasonView } from "./view";

export interface MvpResultRow {
  week_id: string;
  entrant_id: string | null;
  votes: number;
  final: boolean;
}

export interface MvpCandidate {
  entrantId: string;
  name: string;
  role: LolRole;
  /** The viewer's own entry, which they can't vote for. */
  self: boolean;
}

export interface MvpTeam {
  id: string;
  name: string;
  members: MvpCandidate[];
}

export interface MvpOpenWeek {
  weekId: string;
  weekNumber: number;
  /** How many have voted so far. */
  total: number;
  /** The entrant the viewer voted for, if they have. */
  myVote: string | null;
  teams: MvpTeam[];
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

const roleRank = (role: LolRole) => ROLE_ORDER.indexOf(role);

/** The week's teams and players, main tier first, each team in role order. */
export function mvpTeams(view: OffseasonView, weekId: string, userId: string | null): MvpTeam[] {
  return view.teams
    .filter((team) => team.week_id === weekId)
    .sort((a, b) => (a.tier === b.tier ? a.name.localeCompare(b.name) : a.tier === "main" ? -1 : 1))
    .map((team) => ({
      id: team.id,
      name: team.name,
      members: (view.membersByTeam.get(team.id) ?? [])
        .flatMap((member) => {
          const entrant = view.entrantsById.get(member.entrant_id);
          if (!entrant) return [];
          return [{ entrantId: entrant.id, name: entrant.display_name, role: member.role, self: userId !== null && entrant.profile_id === userId }];
        })
        .sort((a, b) => roleRank(a.role) - roleRank(b.role)),
    }))
    .filter((team) => team.members.length > 0);
}

export function buildMvpState(
  view: OffseasonView,
  rows: MvpResultRow[],
  myVotes: { week_id: string; entrant_id: string }[],
  userId: string | null,
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
          teams: mvpTeams(view, openWeek.id, userId),
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
  const [results, mine] = await Promise.all([
    supabase.rpc("offseason_mvp_results", { p_event_id: view.event.id }),
    userId
      ? supabase.from("offseason_mvp_votes").select("week_id, entrant_id").eq("voter_id", userId)
      : Promise.resolve({ data: [], error: null }),
  ]);
  if (results.error) throw new Error(`offseason MVP read failed: ${results.error.message}`);
  if (mine.error) throw new Error(`offseason MVP vote read failed: ${mine.error.message}`);
  return buildMvpState(
    view,
    (results.data as MvpResultRow[] | null) ?? [],
    (mine.data as { week_id: string; entrant_id: string }[] | null) ?? [],
    userId,
  );
}
