// The expedition pages' small words, said one way everywhere: a chance as
// the page prints it, and a list the way the journal writes one.
//
// Pure and import-free, so the board, the rules page and the server's road
// all hold it: nothing here knows a road, a run or a clock.

/** A chance as the page prints it: 0.15 is "15%". */
export const pct = (n: number): string => `${Math.round(n * 100)}%`;

/** "A, B and C" — the journal's list, which never takes an Oxford comma. */
export function listOf(items: string[]): string {
  return items.length <= 1 ? (items[0] ?? "") : `${items.slice(0, -1).join(", ")} and ${items[items.length - 1]}`;
}
