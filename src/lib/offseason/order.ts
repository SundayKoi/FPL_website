// Rating order, kept apart from ratings.ts so client code (the admin
// console's planners) can sort players without bundling the card engine.

import type { OffseasonEntrant } from "./types";

export interface RatingSummary {
  overall: number | null;
  /** Games rated into the Overall (ingested ones). */
  games: number;
  /** The player's record for the whole event, from game results (standings.ts playerRecords). */
  wins: number;
  losses: number;
}

/** What rating order reads; a record left out counts as none. */
export type RatingOrderInput = Pick<RatingSummary, "overall"> & Partial<Pick<RatingSummary, "wins" | "losses">>;

/**
 * Best first: by Overall, then on equal Overalls by the better record (more
 * wins, then fewer losses). Players with no rating yet sort last, by record
 * too, then in sign-up order.
 */
export function compareByRating(
  ratings: Map<string, RatingOrderInput>,
): (a: Pick<OffseasonEntrant, "id" | "signed_up_at">, b: Pick<OffseasonEntrant, "id" | "signed_up_at">) => number {
  return (a, b) => {
    const ra = ratings.get(a.id);
    const rb = ratings.get(b.id);
    const oa = ra?.overall ?? null;
    const ob = rb?.overall ?? null;
    if (oa !== ob) {
      if (oa === null) return 1;
      if (ob === null) return -1;
      return ob - oa;
    }
    return (
      (rb?.wins ?? 0) - (ra?.wins ?? 0) ||
      (ra?.losses ?? 0) - (rb?.losses ?? 0) ||
      a.signed_up_at.localeCompare(b.signed_up_at)
    );
  };
}
