/** Pure list-reordering helpers behind the setup drag-and-drop UI. */

/** Move the item at `from` so it sits at index `to`, shifting the rest along.
 *  Out-of-range indices leave the list untouched rather than dropping items. */
export function moveItem<T>(items: T[], from: number, to: number): T[] {
  if (
    from === to ||
    from < 0 || from >= items.length ||
    to < 0 || to >= items.length
  ) {
    return items;
  }
  const next = items.slice();
  const [moved] = next.splice(from, 1);
  next.splice(to, 0, moved);
  return next;
}

/** Re-sort `items` by an id order held in local state while a save is in
 *  flight. The order is only honoured when it names exactly the same set of
 *  items — after an add or remove it is stale, and showing the server's own
 *  order is safer than dropping or duplicating a team. */
export function applyOrder<T extends { id: string }>(
  items: T[],
  order: string[] | null
): T[] {
  if (!order || order.length !== items.length) return items;
  const byId = new Map(items.map((item) => [item.id, item]));
  const ordered: T[] = [];
  for (const id of order) {
    const item = byId.get(id);
    if (!item) return items; // unknown id, or one this order already used
    byId.delete(id);
    ordered.push(item);
  }
  return ordered.length === items.length ? ordered : items;
}
