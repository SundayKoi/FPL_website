// Roster sets — "collect the five who played for one team, in one week".
//
// A set is the five slots of that week's TEAM CARD, which is why it is
// built with buildTeamCards rather than a second definition of a roster:
// the plate a collector can pull and the set they can complete name the
// same five players, and there is one place that decides who those are.
//
// THE WEEK IS THE WHOLE DESIGN. An earlier version of this file (#89,
// reverted) asked the CURRENT roster, which moves — a trade or a sub's
// first game reopened a finished set. That is tolerable for a progress
// meter and impossible for a payout, because nobody can be un-paid. A set
// is therefore asked of card_editions, which freezes at Tuesday's drop and
// never moves again, and every copy must carry that same edition_week.
//
// Foils, parallels and autographs are irrelevant here: any copy of the
// right player from the right week completes the slot. What makes one copy
// different from another is what dust and trades are for.
//
// Pure — no supabase, no clock. The claim does the reads and hands the
// answers here, the same split ingestFreshness.ts uses.

import { buildTeamCards } from "./teamCards";
import type { PlayerCardData } from "./build";

/** What one completed set pays, once, in betting dollars. */
export const TEAM_SET_BONUS = 100;

export interface TeamSetMember {
  slug: string;
  name: string;
  role: string;
  overall: number;
  /** The copy that fills this slot — a card_inventory id, or null when the
   *  collector doesn't hold one for this week. */
  copyId: number | null;
}

export interface WeekTeamSet {
  teamName: string;
  imageUrl: string | null;
  /** Monday of the edition this set is asked of. */
  weekStart: string;
  /** Exactly five, in role order. */
  members: TeamSetMember[];
  ownedCount: number;
  complete: boolean;
  /** The copies a claim would spend, ascending. Empty unless complete —
   *  a partial set spends nothing, so nothing is at risk while chasing it. */
  copyIds: number[];
}

/** The shape a set needs off an owned copy. InventoryRow satisfies it;
 *  the narrow type keeps this module from depending on the packs layer. */
export interface SetCopy {
  id: number;
  slug: string;
  editionWeek: string;
}

/**
 * Every team's set for one edition week, ordered the way a collector reads
 * them: finished first (they are the trophies), then by how few cards are
 * left, so whatever is one away sits at the top of the chase.
 *
 * `spent` is the copies already claimed on some other set — a claim SPENDS
 * its five, so the same cards cannot be passed between collectors to pay
 * out again and again. That check belongs here rather than in the RPC
 * alone so the button is never offered for a set that would be refused.
 *
 * A team the week's edition doesn't field in all five roles is skipped
 * rather than listed as permanently incomplete: "collect the five who
 * played" has no answer when only four did, and an unachievable row in a
 * list of chases is just noise.
 */
export function buildWeekSets(
  editionCards: PlayerCardData[],
  copies: readonly SetCopy[],
  weekStart: string,
  spent: ReadonlySet<number> = new Set(),
): WeekTeamSet[] {
  // Oldest copy first, so a collector holding three of a player always
  // spends the same one and the button doesn't change what it would do
  // between renders.
  const bySlug = new Map<string, number[]>();
  for (const copy of copies) {
    if (copy.editionWeek !== weekStart || spent.has(copy.id)) continue;
    const list = bySlug.get(copy.slug) ?? [];
    list.push(copy.id);
    bySlug.set(copy.slug, list);
  }
  for (const list of bySlug.values()) list.sort((a, b) => a - b);

  return buildTeamCards(editionCards, undefined, weekStart)
    .filter((team) => team.slots.every((slot) => slot.slug))
    .map((team) => {
      const members = team.slots.map((slot) => ({
        slug: slot.slug as string,
        name: slot.name,
        role: slot.role,
        overall: slot.overall,
        copyId: bySlug.get(slot.slug as string)?.[0] ?? null,
      }));
      const ownedCount = members.filter((member) => member.copyId !== null).length;
      const complete = ownedCount === members.length;
      return {
        teamName: team.teamName,
        imageUrl: team.imageUrl,
        weekStart,
        members,
        ownedCount,
        complete,
        copyIds: complete ? members.map((member) => member.copyId as number).sort((a, b) => a - b) : [],
      };
    })
    .sort(
      (a, b) =>
        Number(b.complete) - Number(a.complete) ||
        b.ownedCount - a.ownedCount ||
        a.teamName.localeCompare(b.teamName),
    );
}

/** How many of these are finished — the "3 of 8 complete" line. */
export function completedSetCount(sets: readonly WeekTeamSet[]): number {
  return sets.filter((set) => set.complete).length;
}
