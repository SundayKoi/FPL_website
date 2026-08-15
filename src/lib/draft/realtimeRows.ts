/** Row merging for the draft board's realtime stream.
 *
 *  Split out of useDraftState so the merge rules are testable without standing
 *  up a whole Supabase channel mock. */

/** Insert or replace a row by id. Rows with no id are ignored — a DELETE
 *  payload's `new` is empty, and upserting it would corrupt state. */
export function upsertRow<T extends { id: unknown }>(rows: T[], row: T): T[] {
  if (row?.id == null) return rows;
  const i = rows.findIndex((r) => r.id === row.id);
  return i === -1 ? [...rows, row] : rows.map((r, j) => (j === i ? row : r));
}

/** Drop a row named by a DELETE payload's `old`, which carries only the primary
 *  key. Ids are UUIDs, so an id belonging to another draft simply isn't present
 *  and this is a no-op — which is what lets the DELETE subscriptions run
 *  unfiltered (see useDraftState). */
export function removeRow<T extends { id: unknown }>(
  rows: T[],
  old: { id?: unknown } | null | undefined
): T[] {
  const id = old?.id;
  if (id == null) return rows;
  return rows.filter((r) => r.id !== id);
}
