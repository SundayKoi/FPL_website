/** Maximum-cardinality, then maximum-score assignment. Dummy columns allow
 * an honest partial result when the played champion pools cannot cover everyone.
 * Hungarian assignment avoids the greedy trap of taking a flexible player's
 * first choice and stranding a player who has only that champion. */
export function assignChampions<T extends { playerKey: string; champion: string; value: number }>(candidates: T[]): T[] {
  const players = [...new Set(candidates.map(c => c.playerKey))].sort();
  const champions = [...new Set(candidates.map(c => c.champion))].sort();
  const choices = new Map(candidates.map(c => [JSON.stringify([c.playerKey, c.champion]), c]));
  const n = players.length;
  const m = champions.length + n;
  if (!n) return [];
  const largestScore = Math.max(1, ...candidates.map(c => Math.abs(c.value)));
  const coverageBonus = (2 * n + 1) * largestScore;
  const cost = (i: number, j: number) => {
    if (j > champions.length) return 0;
    const candidate = choices.get(JSON.stringify([players[i - 1], champions[j - 1]]));
    return candidate ? -coverageBonus - candidate.value : coverageBonus;
  };
  const u = Array(n + 1).fill(0) as number[];
  const v = Array(m + 1).fill(0) as number[];
  const matched = Array(m + 1).fill(0) as number[];
  const previous = Array(m + 1).fill(0) as number[];
  for (let i = 1; i <= n; i++) {
    matched[0] = i;
    let column = 0;
    const minimum = Array(m + 1).fill(Infinity) as number[];
    const used = Array(m + 1).fill(false) as boolean[];
    do {
      used[column] = true;
      const row = matched[column];
      let delta = Infinity;
      let next = 0;
      for (let j = 1; j <= m; j++) {
        if (used[j]) continue;
        const reduced = cost(row, j) - u[row] - v[j];
        if (reduced < minimum[j]) { minimum[j] = reduced; previous[j] = column; }
        if (minimum[j] < delta) { delta = minimum[j]; next = j; }
      }
      for (let j = 0; j <= m; j++) {
        if (used[j]) { u[matched[j]] += delta; v[j] -= delta; }
        else minimum[j] -= delta;
      }
      column = next;
    } while (matched[column] !== 0);
    do {
      const before = previous[column];
      matched[column] = matched[before];
      column = before;
    } while (column !== 0);
  }
  return champions.flatMap((champion, index) => {
    const playerIndex = matched[index + 1];
    const candidate = choices.get(JSON.stringify([players[playerIndex - 1], champion]));
    return candidate ? [candidate] : [];
  }).sort((a, b) => a.playerKey.localeCompare(b.playerKey));
}
