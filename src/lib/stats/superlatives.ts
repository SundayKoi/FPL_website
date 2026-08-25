// "League-best at X" badges.
//
// A grid of teams with the same ten numbers on each makes every team look
// the same. One badge saying "most first bloods" is the thing someone
// actually repeats out loud, so the numbers get a headline.
//
// Lives here rather than inside the tab because the tie rule below is a
// real decision worth pinning down in a test, not a detail of the markup.

export interface Superlative<T> {
  /** Stable id, for keys. */
  key: string;
  /** What the badge says. */
  label: string;
  /** The number being compared. */
  pick: (row: T) => number;
  /** Set when the smallest number wins (fastest games, fewest deaths). */
  lowIsBest?: boolean;
}

/**
 * Award each superlative to the single row that leads it.
 *
 * A tie at the top awards nobody. "Best" by a rounding error is not a fact,
 * and handing the badge to whichever row happened to sort first would make
 * it depend on the input order rather than on the play. Rows that cannot
 * win an award simply do not appear in the returned map.
 *
 * Returns name -> labels, in the order the awards were declared, so a team
 * with three badges shows them the same way every render.
 */
export function awardSuperlatives<T>(
  rows: T[],
  nameOf: (row: T) => string,
  awards: Superlative<T>[],
): Map<string, string[]> {
  const badges = new Map<string, string[]>();
  if (rows.length < 2) return badges;

  for (const award of awards) {
    let best: T | null = null;
    let tied = false;
    for (const row of rows) {
      if (best === null) {
        best = row;
        continue;
      }
      const value = award.pick(row);
      const bestValue = award.pick(best);
      if (value === bestValue) {
        tied = true;
      } else if (award.lowIsBest ? value < bestValue : value > bestValue) {
        best = row;
        tied = false;
      }
    }
    if (best === null || tied) continue;
    const name = nameOf(best);
    badges.set(name, [...(badges.get(name) ?? []), award.label]);
  }

  return badges;
}
