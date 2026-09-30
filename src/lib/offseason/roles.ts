// Who plays which role, and how many teams the pool makes.
//
// The event's rule: first come, first served. Earlier sign-ups keep their
// primary role; a later player whose primary is full plays their secondary
// when that role is short; and a role with more players than teams leaves
// the latest sign-ups out ("7 tops for 4 teams: 3 tops sit out"). Staff see
// the plan and can change any row before it is applied.

import { ROLE_ORDER, type LolRole } from "@/lib/draft/types";
import { TEAM_SIZE, type EntrantStatus } from "./types";

export interface RolePlanEntrant {
  id: string;
  primary_role: LolRole;
  secondary_role: LolRole | null;
  signed_up_at: string;
  status: EntrantStatus;
}

export interface RolePlanRow {
  entrantId: string;
  role: LolRole | null;
  status: "active" | "benched";
  /** Plays their secondary role rather than their primary. */
  onSecondary: boolean;
}

export interface RolePlan {
  teamCount: number;
  rows: RolePlanRow[];
  /** Players per role before anyone sits out. */
  primaryCounts: Record<LolRole, number>;
}

function emptyCounts(): Record<LolRole, number> {
  return { top: 0, jungle: 0, mid: 0, adc: 0, support: 0 };
}

function bySignup(a: RolePlanEntrant, b: RolePlanEntrant): number {
  return a.signed_up_at.localeCompare(b.signed_up_at) || a.id.localeCompare(b.id);
}

/** Tries to fill every role to `teams`; the assignment if it can, else null. */
function fillRoles(pool: RolePlanEntrant[], teams: number): Map<string, LolRole> | null {
  const assigned = new Map<string, LolRole>();
  const count = emptyCounts();
  const overflow: RolePlanEntrant[] = [];

  for (const entrant of pool) {
    if (count[entrant.primary_role] < teams) {
      assigned.set(entrant.id, entrant.primary_role);
      count[entrant.primary_role] += 1;
    } else {
      overflow.push(entrant);
    }
  }

  // A later player fills a short role they named as their secondary.
  for (const entrant of [...overflow]) {
    const secondary = entrant.secondary_role;
    if (secondary && count[secondary] < teams) {
      assigned.set(entrant.id, secondary);
      count[secondary] += 1;
      overflow.splice(overflow.indexOf(entrant), 1);
    }
  }

  // One step further: someone already placed moves to their secondary (a
  // short role) so an overflow player can take the role they vacated.
  let moved = true;
  while (moved) {
    moved = false;
    for (const short of ROLE_ORDER) {
      if (count[short] >= teams) continue;
      for (const [placedId, placedRole] of assigned) {
        const placed = pool.find((entrant) => entrant.id === placedId)!;
        if (placed.secondary_role !== short) continue;
        const replacement = overflow.find(
          (entrant) => entrant.primary_role === placedRole || entrant.secondary_role === placedRole,
        );
        if (!replacement) continue;
        assigned.set(placedId, short);
        assigned.set(replacement.id, placedRole);
        count[short] += 1;
        overflow.splice(overflow.indexOf(replacement), 1);
        moved = true;
        break;
      }
      if (moved) break;
    }
  }

  return ROLE_ORDER.every((role) => count[role] === teams) ? assigned : null;
}

/** The most full teams the pool supports, and each player's role in them. */
export function planRoles(entrants: RolePlanEntrant[]): RolePlan {
  const pool = entrants.filter((entrant) => entrant.status === "active" || entrant.status === "benched").sort(bySignup);
  const primaryCounts = emptyCounts();
  for (const entrant of pool) primaryCounts[entrant.primary_role] += 1;

  for (let teams = Math.floor(pool.length / TEAM_SIZE); teams > 0; teams -= 1) {
    const assigned = fillRoles(pool, teams);
    if (!assigned) continue;
    return {
      teamCount: teams,
      primaryCounts,
      rows: pool.map((entrant) => {
        const role = assigned.get(entrant.id) ?? null;
        return {
          entrantId: entrant.id,
          role: role ?? entrant.primary_role,
          status: role ? "active" : "benched",
          onSecondary: role !== null && role !== entrant.primary_role,
        };
      }),
    };
  }

  return {
    teamCount: 0,
    primaryCounts,
    rows: pool.map((entrant) => ({ entrantId: entrant.id, role: entrant.primary_role, status: "benched", onSecondary: false })),
  };
}
