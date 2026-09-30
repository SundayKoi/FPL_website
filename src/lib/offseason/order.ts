// Rating order, kept apart from ratings.ts so client code (the admin
// console's planners) can sort players without bundling the card engine.

import type { OffseasonEntrant } from "./types";

export interface RatingSummary {
  overall: number | null;
  games: number;
  wins: number;
  losses: number;
}

/** Best first; players with no rating yet sort last, in sign-up order. */
export function compareByRating(
  ratings: Map<string, Pick<RatingSummary, "overall">>,
): (a: Pick<OffseasonEntrant, "id" | "signed_up_at">, b: Pick<OffseasonEntrant, "id" | "signed_up_at">) => number {
  return (a, b) => {
    const ra = ratings.get(a.id)?.overall ?? null;
    const rb = ratings.get(b.id)?.overall ?? null;
    if (ra !== rb) {
      if (ra === null) return 1;
      if (rb === null) return -1;
      return rb - ra;
    }
    return a.signed_up_at.localeCompare(b.signed_up_at);
  };
}
