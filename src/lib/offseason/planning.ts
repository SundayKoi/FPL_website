// A week's setup: who drops into the elimination tier, who captains, and
// the tiers a week is locked with (offseason_set_week_entries). Everything
// here is a proposal staff can change before locking.

import { ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import { compareByRating, type EntrantRating } from "./ratings";
import type { EntryTier, OffseasonEntrant } from "./types";

/** Active players with a role — the ones a week can place. */
export function playablePlayers(entrants: OffseasonEntrant[]): OffseasonEntrant[] {
  return entrants.filter((entrant) => entrant.status === "active" && entrant.assigned_role !== null);
}

export interface EliminationProposal {
  /** The lowest-rated players of each role, lowest first. */
  byRole: Record<LolRole, OffseasonEntrant[]>;
  ids: Set<string>;
  /** Active players with no rated game yet, never proposed automatically. */
  unrated: OffseasonEntrant[];
}

/** The bottom `perRole` rated players in each role. */
export function proposeElimination(
  entrants: OffseasonEntrant[],
  ratings: Map<string, EntrantRating>,
  perRole: number,
): EliminationProposal {
  const byRole: Record<LolRole, OffseasonEntrant[]> = { top: [], jungle: [], mid: [], adc: [], support: [] };
  const unrated: OffseasonEntrant[] = [];
  const best = compareByRating(ratings);
  for (const role of ROLE_ORDER) {
    const players = playablePlayers(entrants).filter((entrant) => entrant.assigned_role === role);
    unrated.push(...players.filter((entrant) => ratings.get(entrant.id)?.overall == null));
    const rated = players.filter((entrant) => ratings.get(entrant.id)?.overall != null).sort(best).reverse();
    byRole[role] = rated.slice(0, Math.max(0, perRole));
  }
  return { byRole, ids: new Set(ROLE_ORDER.flatMap((role) => byRole[role].map((entrant) => entrant.id))), unrated };
}

/**
 * The best-rated players in a tier's pool, one per team to captain it.
 * Captains bid from their site account, so players who never linked one
 * are passed over.
 */
export function suggestCaptains(
  pool: OffseasonEntrant[],
  ratings: Map<string, EntrantRating>,
  count: number,
): OffseasonEntrant[] {
  return pool
    .filter((entrant) => entrant.profile_id !== null)
    .sort(compareByRating(ratings))
    .slice(0, Math.max(0, count));
}

export interface WeekEntryPlan {
  entrant_id: string;
  tier: EntryTier;
  captain_seat: number | null;
}

export interface WeekPlan {
  entries: WeekEntryPlan[];
  mainTeams: number;
  eliminationTeams: number;
  /** Players who sit this week out because their role is over-full. */
  sittingOut: OffseasonEntrant[];
  problems: string[];
}

function tierTeams(players: OffseasonEntrant[]): { teams: number; extras: OffseasonEntrant[] } {
  const byRole = new Map<LolRole, OffseasonEntrant[]>(ROLE_ORDER.map((role) => [role, []]));
  for (const player of players) byRole.get(player.assigned_role!)!.push(player);
  const teams = Math.min(...ROLE_ORDER.map((role) => byRole.get(role)!.length));
  // Over-full roles sit their latest sign-ups out: first come, first served.
  const extras = ROLE_ORDER.flatMap((role) =>
    byRole.get(role)!.sort((a, b) => a.signed_up_at.localeCompare(b.signed_up_at)).slice(teams),
  );
  return { teams, extras };
}

/**
 * The week's tiers from the staff's choices: the elimination group, and the
 * captains of each tier in seat order. Everyone else active plays the round
 * robin; a role with more players than teams sits its latest sign-ups out.
 */
export function planWeek({
  entrants,
  eliminationIds,
  mainCaptainIds,
  eliminationCaptainIds,
}: {
  entrants: OffseasonEntrant[];
  eliminationIds: Set<string>;
  mainCaptainIds: string[];
  eliminationCaptainIds: string[];
}): WeekPlan {
  const players = playablePlayers(entrants);
  const eliminationPool = players.filter((entrant) => eliminationIds.has(entrant.id));
  const mainPool = players.filter((entrant) => !eliminationIds.has(entrant.id));
  const main = tierTeams(mainPool);
  const elimination = tierTeams(eliminationPool);
  const captainSet = new Set([...mainCaptainIds, ...eliminationCaptainIds]);
  const sittingOut = [...main.extras, ...elimination.extras].filter((entrant) => !captainSet.has(entrant.id));
  const sittingIds = new Set(sittingOut.map((entrant) => entrant.id));

  const problems: string[] = [];
  const check = (label: string, captains: string[], pool: OffseasonEntrant[], teams: number) => {
    const inPool = new Set(pool.map((entrant) => entrant.id));
    const valid = captains.filter((id) => inPool.has(id));
    if (valid.length !== captains.length) problems.push(`A ${label} captain is not in the ${label} pool.`);
    if (teams > 0 && valid.length !== teams) problems.push(`${teams} ${label} teams need ${teams} captains; ${valid.length} picked.`);
  };
  check("main", mainCaptainIds, mainPool, main.teams);
  if (eliminationPool.length > 0) check("elimination", eliminationCaptainIds, eliminationPool, elimination.teams);
  if (main.teams === 1) problems.push("The round robin needs at least two teams.");
  if (eliminationPool.length > 0 && elimination.teams < 2) problems.push("The elimination tier needs at least two full teams.");

  const seat = (ids: string[], id: string) => (ids.includes(id) ? ids.indexOf(id) + 1 : null);
  const entries: WeekEntryPlan[] = entrants
    .filter((entrant) => entrant.status === "active" || entrant.status === "benched")
    .map((entrant) => {
      if (entrant.status === "benched" || entrant.assigned_role === null || sittingIds.has(entrant.id)) {
        return { entrant_id: entrant.id, tier: "bench" as const, captain_seat: null };
      }
      if (eliminationIds.has(entrant.id)) {
        return { entrant_id: entrant.id, tier: "elimination" as const, captain_seat: seat(eliminationCaptainIds, entrant.id) };
      }
      return { entrant_id: entrant.id, tier: "main" as const, captain_seat: seat(mainCaptainIds, entrant.id) };
    });

  return { entries, mainTeams: main.teams, eliminationTeams: elimination.teams, sittingOut, problems };
}
