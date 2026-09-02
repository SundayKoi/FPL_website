// The Vault's rules: what the registry of one-of-ones is made of, and the
// order it reads in.
//
// The page is two lists — the Eclipses that have been found, and the crowned
// prints nobody has pulled yet — and both of them have an order that carries
// meaning. Newest week first, because the top of the board is what is
// currently being chased; role order inside a week, because a Card of the
// Week is one per role and Top/Jungle/Mid/Bot/Support is the order every
// other surface in this codebase lists a team in. Alphabetical would scatter
// the five names of a week into a sequence nobody reads a roster in.
//
// Pure and framework-free on purpose, same split as the rest of src/lib: the
// IO lives next door in vaultQueries.ts, so the ordering can be pinned by
// tests without a database and the shapes below can be imported from either
// side of the client boundary (they are types only).

import type { PlayerCardData } from "@/lib/cards/build";

/** Who holds a one-of-one, as the registry names them. `name` falls back to
 *  the raw Discord id the way fetchBettingUsernames does; `flame` is the
 *  patron colour and is null for everybody else. */
export interface VaultOwner {
  discordId: string;
  name: string;
  avatarUrl: string | null;
  flame: string | null;
}

/** One Eclipse that exists. The frozen card rides along because the registry
 *  draws the actual copy — its ink, its art, its Eclipse treatment — not
 *  today's rebuild of that player. */
export interface FoundEclipse {
  inventoryId: number;
  slug: string;
  playerName: string;
  role: string;
  tier: string;
  overall: number;
  editionWeek: string;
  signed: boolean;
  acquiredAt: string;
  /** The one mutable thing on a copy, and therefore the copy image's cache
   *  key — see copyImageUrl. Null on a card that has never been deployed. */
  expeditionMark: string | null;
  card: PlayerCardData;
  owner: VaultOwner;
  /** describeProvenance's lines, oldest first — the chain of custody, which
   *  is the entire point of a registry as opposed to a gallery. */
  chain: string[];
}

/** A crowned print with no Eclipse against it: a one-of-one that exists as a
 *  possibility and nothing more. Claimable through that week's packs
 *  forever, which is why old weeks stay on the board. */
export interface UnclaimedPrint {
  editionWeek: string;
  slug: string;
  playerName: string;
  role: string;
  tier: string;
  /** That player has inked a signature, so whoever pulls this one gets it
   *  autographed — applyEclipse takes the ink automatically. It is the
   *  difference between the two grades of one-of-one, so the board says so. */
  mintsSigned: boolean;
}

/** One week's worth of unclaimed prints. */
export interface UnclaimedWeek {
  editionWeek: string;
  prints: UnclaimedPrint[];
}

/** Both halves of the registry, as fetchVault returns them. */
export interface VaultData {
  found: FoundEclipse[];
  unclaimed: UnclaimedPrint[];
}

/** Map order, matching ROLE_LABELS in cards/build.ts — the labels frozen
 *  into every card's `role`. Lowercased for the comparison because the
 *  archive stores whatever the build wrote and a future rename should sort
 *  rather than fall to the bottom. */
const ROLE_ORDER = ["top", "jungle", "mid", "bot", "support"];

/** Where a role sorts. An unrecognised role sorts last rather than first:
 *  a role this list has never heard of is likelier to be a data problem
 *  than the new Top lane. */
export function vaultRoleRank(role: string): number {
  const index = ROLE_ORDER.indexOf(role.trim().toLowerCase());
  return index === -1 ? ROLE_ORDER.length : index;
}

/**
 * The unclaimed board: newest week first, map order within a week.
 *
 * Weeks are ISO dates (`YYYY-MM-DD`), which sort lexicographically exactly
 * as they sort chronologically — no Date parsing, and therefore no timezone
 * to get wrong on a value that is a calendar date rather than an instant.
 *
 * Ties inside a role (which should not happen — one crown per role per week
 * — but a board is not the place to discover that) fall back to the player
 * name, so the output is a total order and the page never re-shuffles
 * between renders.
 */
export function groupUnclaimedByWeek<T extends { editionWeek: string; role: string; playerName: string }>(
  prints: readonly T[],
): { editionWeek: string; prints: T[] }[] {
  const weeks = new Map<string, T[]>();
  for (const print of prints) {
    const bucket = weeks.get(print.editionWeek);
    if (bucket) bucket.push(print);
    else weeks.set(print.editionWeek, [print]);
  }
  return [...weeks.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([editionWeek, group]) => ({
      editionWeek,
      prints: [...group].sort(
        (a, b) => vaultRoleRank(a.role) - vaultRoleRank(b.role) || a.playerName.localeCompare(b.playerName),
      ),
    }));
}

/**
 * The found Eclipses, most recently found first.
 *
 * Not by edition week: an Eclipse from an old week can be pulled tomorrow,
 * and "what has just been found" is the news. `acquiredAt` alone is not a
 * total order (two copies out of one pack share it, and only one of them can
 * be the Eclipse — but the tiebreak costs nothing and paging or re-rendering
 * on a non-total order is how lists start flickering), so the id breaks it.
 */
export function orderFound<T extends { acquiredAt: string; inventoryId: number }>(found: readonly T[]): T[] {
  return [...found].sort(
    (a, b) => b.acquiredAt.localeCompare(a.acquiredAt) || b.inventoryId - a.inventoryId,
  );
}

/**
 * The two numbers the page leads with, plus what they add up to.
 *
 * `total` is every one-of-one this season HAS — found plus outstanding —
 * which is the number that grows by five every Tuesday when the edition
 * archives. Counting it here rather than at the call site keeps the page
 * from doing arithmetic on two lists it has already been handed.
 */
export function vaultTotals(vault: {
  found: readonly unknown[];
  unclaimed: readonly unknown[];
}): { found: number; unclaimed: number; total: number } {
  return {
    found: vault.found.length,
    unclaimed: vault.unclaimed.length,
    total: vault.found.length + vault.unclaimed.length,
  };
}
