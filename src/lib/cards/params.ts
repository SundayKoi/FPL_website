/**
 * An inventory id out of a query string, or null.
 *
 * The shelf's per-copy actions land on Market, Trades, Expeditions and
 * Fantasy with `?sell=`, `?offer=`, `?send=` and `?field=` naming the copy.
 * These are hints for which card to open the form on, never permissions:
 * every page still checks the copy is the viewer's and available before it
 * selects anything, and a junk value simply opens the form empty.
 */
export function parseInventoryId(value: string | string[] | undefined): number | null {
  const raw = Array.isArray(value) ? value[0] : value;
  if (!raw || !/^\d{1,12}$/.test(raw)) return null;
  const id = Number(raw);
  return Number.isSafeInteger(id) && id > 0 ? id : null;
}
