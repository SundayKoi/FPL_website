import type { TradeCardOption } from "./TradeBuilder";

/** Best card first — the thing a trader scans for. The trade builder and the
 *  listing form put a shelf in this same order. */
export function byValue(a: TradeCardOption, b: TradeCardOption): number {
  return b.overall - a.overall || a.playerName.localeCompare(b.playerName);
}
