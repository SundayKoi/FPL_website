// Team sets — "collect every player on one roster".
//
// Pure computation over the season's cards and the slugs a collector owns.
// Nothing is stored: a set is just a question asked of the inventory, so it
// can never drift out of sync with what someone actually holds, and there
// is no state to migrate when a roster changes.
//
// The set is the team's CURRENT rated roster, which means it moves when a
// player is traded or a sub plays their first game. That is the honest
// reading of "collect this team" — the alternative, freezing the roster at
// some arbitrary moment, would leave sets asking for players who no longer
// play for the team at all.

import type { PlayerCardData } from "./build";

export interface TeamSetMember {
  slug: string;
  name: string;
  role: string;
  overall: number;
  owned: boolean;
}

export interface TeamSet {
  teamName: string;
  imageUrl: string | null;
  members: TeamSetMember[];
  ownedCount: number;
  /** Every member owned. Empty rosters are never "complete" — a team with
   *  no rated players yet would otherwise show up as a free set. */
  complete: boolean;
}

/**
 * One entry per team with at least one rated player, ordered by how close
 * the collector is to finishing it: completed sets first (they are the
 * trophies), then by remaining cards ascending, so the set that is one
 * card away sits at the top of the list of what is left to chase.
 */
export function buildTeamSets(cards: PlayerCardData[], ownedSlugs: Iterable<string>): TeamSet[] {
  const owned = ownedSlugs instanceof Set ? ownedSlugs : new Set(ownedSlugs);
  const byTeam = new Map<string, PlayerCardData[]>();
  for (const card of cards) {
    if (!card.teamName) continue;
    const list = byTeam.get(card.teamName) ?? [];
    list.push(card);
    byTeam.set(card.teamName, list);
  }

  return [...byTeam.entries()]
    .map(([teamName, players]) => {
      const roster = [...players].sort((a, b) => b.overall - a.overall || a.name.localeCompare(b.name));
      const members = roster.map((player) => ({
        slug: player.slug,
        name: player.name,
        role: player.role,
        overall: player.overall,
        owned: owned.has(player.slug),
      }));
      const ownedCount = members.filter((member) => member.owned).length;
      return {
        teamName,
        imageUrl: roster.find((player) => player.teamImageUrl)?.teamImageUrl ?? null,
        members,
        ownedCount,
        complete: members.length > 0 && ownedCount === members.length,
      };
    })
    .sort((a, b) => {
      if (a.complete !== b.complete) return a.complete ? -1 : 1;
      const remainingA = a.members.length - a.ownedCount;
      const remainingB = b.members.length - b.ownedCount;
      return remainingA - remainingB || a.teamName.localeCompare(b.teamName);
    });
}

/** How many sets are finished — the headline number for the section. */
export function completedSetCount(sets: TeamSet[]): number {
  return sets.filter((set) => set.complete).length;
}
