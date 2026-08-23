// A collector's shelf: one entry per player owned, showing the best copy.
//
// Duplicates are the point of a pack economy — you pull the same player in
// different weeks at different ratings — so a player appears once here and
// the copies collapse into a count plus the edition chips underneath. The
// card on display is the best copy, since that's the one you'd actually
// field (and the one worth looking at).
//
// No hooks: the grid is pure derivation over rows the page already fetched,
// so it stays a server component and only PlayerCard3D ships to the client.

import type { InventoryRow } from "@/lib/packs/queries";
import PlayerCard3D from "./PlayerCard3D";

/** "2026-08-17" → "WK Aug 17". Parsed as UTC on purpose: edition weeks are
 *  Mondays in UTC (src/lib/packs/week.ts), and letting the browser's local
 *  timezone read the string would slide a chunk of the world back a day. */
function editionLabel(week: string): string {
  const date = new Date(`${week}T00:00:00Z`);
  if (Number.isNaN(date.getTime())) return week;
  return `WK ${date.toLocaleDateString("en-US", { month: "short", day: "numeric", timeZone: "UTC" })}`;
}

/** The copy to put on the shelf: an autographed copy outranks everything —
 *  the ink is the rarest thing that can happen to a pull, and nobody shelves
 *  a plain copy over a signed one — then highest overall, foil winning a tie
 *  (identical ratings are the same card, and the foil is the nicer print). */
function betterCopy(a: InventoryRow, b: InventoryRow): InventoryRow {
  if (a.signed !== b.signed) return b.signed ? b : a;
  if (b.overall !== a.overall) return b.overall > a.overall ? b : a;
  return b.foil && !a.foil ? b : a;
}

export default function CollectionGrid({ inventory }: { inventory: InventoryRow[] }) {
  if (inventory.length === 0) {
    return <p className="text-sm text-steel">No cards yet — open your first pack.</p>;
  }

  const groups = new Map<string, InventoryRow[]>();
  for (const row of inventory) {
    const copies = groups.get(row.slug) ?? [];
    copies.push(row);
    groups.set(row.slug, copies);
  }

  const owned = [...groups.values()]
    .map((copies) => ({
      best: copies.reduce(betterCopy),
      count: copies.length,
      foils: copies.filter((copy) => copy.foil).length,
      signatures: copies.filter((copy) => copy.signed).length,
      // Chronological, so the chips read as a print history.
      editions: [...new Set(copies.map((copy) => copy.editionWeek))].sort(),
    }))
    .sort((a, b) => b.best.overall - a.best.overall);

  return (
    /* card-cell skips the paint for shelves scrolled out of view; it brings its
       own padding, so the gaps come down by that much to sit where they did. */
    <div className="flex flex-wrap justify-center gap-x-0 gap-y-4">
      {owned.map((entry) => (
        <div key={entry.best.slug} className="card-cell flex flex-col items-center gap-2">
          <PlayerCard3D card={entry.best.card} interactive forceFoil={entry.best.foil} />
          <div className="flex flex-col items-center gap-1.5 text-center">
            <span className="text-sm font-semibold text-white">
              {entry.best.playerName}
              {entry.count > 1 ? <span className="ml-1.5 text-xs font-bold text-steel">×{entry.count}</span> : null}
            </span>
            <div className="flex flex-wrap justify-center gap-1">
              {entry.editions.map((week) => (
                <span
                  key={week}
                  className="rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel"
                >
                  {editionLabel(week)}
                </span>
              ))}
              {entry.signatures > 0 ? (
                <span
                  className="rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-gold"
                  title={`${entry.signatures} autographed ${entry.signatures === 1 ? "copy" : "copies"}`}
                >
                  {"✍".repeat(entry.signatures)}
                </span>
              ) : null}
              {entry.foils > 0 ? (
                <span
                  className="rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-gold"
                  title={`${entry.foils} foil ${entry.foils === 1 ? "copy" : "copies"}`}
                >
                  {"✦".repeat(entry.foils)}
                </span>
              ) : null}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}
