/** Index finite observations once. Ties share a midrank; a singleton is neutral. */
export function createMidrankIndex(distribution: readonly number[]): ReadonlyMap<number, number> | null {
  if (!distribution.length || distribution.some((value) => !Number.isFinite(value))) return null;
  const sorted = [...distribution].sort((a, b) => a - b);
  const ranks = new Map<number, number>();
  for (let start = 0; start < sorted.length;) {
    let end = start + 1;
    while (end < sorted.length && sorted[end] === sorted[start]) end++;
    ranks.set(sorted[start], sorted.length === 1 ? 50 : 100 * (start + (end - start - 1) / 2) / (sorted.length - 1));
    start = end;
  }
  return ranks;
}
