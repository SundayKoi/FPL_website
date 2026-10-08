// Lock-in: once staff assign roles, each player confirms they are playing
// the role they were given. A lock-in records the role it accepted and only
// counts while that is still the player's role, so a role change asks the
// player to lock in again (see supabase/migrations/20261108000001_offseason_lock_in.sql).

import type { LolRole } from "@/lib/draft/types";
import type { OffseasonEntrant, OffseasonEvent } from "./types";

export type LockInState =
  /** Withdrawn, eliminated or sitting out: nothing to confirm. */
  | "not_playing"
  /** Playing, but staff have not given them a role yet. */
  | "no_role"
  /** Has a role and has not confirmed it. */
  | "pending"
  /** Confirmed a role they no longer hold. */
  | "role_changed"
  /** Confirmed the role they hold. */
  | "locked";

type LockInFields = Pick<OffseasonEntrant, "status" | "assigned_role" | "locked_in_role">;

export function lockInState(entrant: LockInFields): LockInState {
  if (entrant.status !== "active") return "not_playing";
  if (!entrant.assigned_role) return "no_role";
  if (entrant.locked_in_role === entrant.assigned_role) return "locked";
  return entrant.locked_in_role ? "role_changed" : "pending";
}

/** How many players with a role have confirmed it. */
export function lockInCounts(entrants: LockInFields[]): { locked: number; playing: number } {
  const states = entrants.map(lockInState).filter((state) => state !== "not_playing" && state !== "no_role");
  return { locked: states.filter((state) => state === "locked").length, playing: states.length };
}

/**
 * Whether a page shows the lock-in panel: once roles are assigned and until
 * the event ends, always to a player in it, and to anyone else only while
 * someone still has to lock in.
 */
export function lockInOpen(
  event: Pick<OffseasonEvent, "status">,
  entrants: LockInFields[],
  ownEntry: OffseasonEntrant | null,
): boolean {
  if (event.status === "complete") return false;
  const { locked, playing } = lockInCounts(entrants);
  return playing > 0 && (ownEntry !== null || locked < playing);
}

/** A staff-added spot someone can claim: no account yet, playing a role. */
export interface ClaimableSpot {
  displayName: string;
  riotId: string;
  role: LolRole;
}

export function claimableSpots(entrants: OffseasonEntrant[]): ClaimableSpot[] {
  return entrants
    .filter((entrant) => entrant.profile_id === null && entrant.status === "active" && entrant.assigned_role)
    .map((entrant) => ({ displayName: entrant.display_name, riotId: entrant.riot_id, role: entrant.assigned_role! }));
}

const riotKey = (riotId: string) => riotId.toLowerCase().replace(/\s+/g, "");

/** The spot whose Riot ID matches what the player typed, ignoring case and spaces. */
export function findSpot(spots: ClaimableSpot[], typed: string): ClaimableSpot | null {
  const key = riotKey(typed);
  if (!key.includes("#")) return null;
  return spots.find((spot) => riotKey(spot.riotId) === key) ?? null;
}
