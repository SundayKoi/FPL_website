"use client";

// A collector's shelf: one entry per player owned, showing the best copy —
// with a way to go and actually LOOK at the variant prints underneath.
//
// Duplicates are the point of a pack economy — you pull the same player in
// different weeks at different ratings — so in the default view a player
// appears once and the copies collapse into a count plus the edition chips
// underneath. The card on display is the best copy, since that's the one
// you'd actually field (and the one worth looking at).
//
// But the whole reason a copy is worth keeping is often cosmetic: an
// alternate skin, a foil, a signature. Those are things you own to SEE, and
// a chip reading "✦✦" is not seeing them. So the shelf carries two modes:
//
//   All        — the collapsed shelf above, plus a per-player "View prints"
//                strip for players owned in more than one distinct print.
//   ✦ / ✍ / Alt — a showcase: every matching COPY on its own card, because
//                when you filter to foils you want the foils, not one card
//                per player that happens to have a foil somewhere in the
//                stack.
//
// The filters need state, so this is a client component. That means the
// frozen `card` json of every copy crosses the boundary rather than one per
// player — unavoidable, since a showcase renders the copies themselves, and
// each one's art and ink live in its own frozen json. DustControls rides
// along on that same json (it shows each copy before you destroy it) and
// still only appears in the All view: the variant views are a display case,
// not a workbench.

import { useState } from "react";
import type { InventoryRow } from "@/lib/packs/queries";
import { editionLabel } from "@/lib/packs/week";
import BinderPinButton from "./BinderPinButton";
import DustControls from "./DustControls";
import PlayerCard3D from "./PlayerCard3D";

type VariantFilter = "all" | "foil" | "signed" | "alt";

const FILTERS: { key: VariantFilter; label: string }[] = [
  { key: "all", label: "All" },
  { key: "foil", label: "✦ Foils" },
  { key: "signed", label: "✍ Signed" },
  { key: "alt", label: "Alt arts" },
];

/** Each empty state names the odds, because "you have none" and "these are
 *  hard to get" are the same sentence in a pack economy. */
const EMPTY_COPY: Record<Exclude<VariantFilter, "all">, string> = {
  foil: "No foils yet — they're a 6% pull.",
  signed: "No signed cards yet — 1-in-100 pulls of players who signed.",
  alt: "No alternate prints yet — 30% of pulls come in an alternate skin.",
};

/** The skin this copy printed in; 0 is the champion's base splash. Read off
 *  the frozen json rather than a flat column — the roll is only recorded
 *  there (src/lib/packs/skins.ts). */
function skinOf(row: InventoryRow): number {
  return row.card?.artSkin ?? 0;
}

const MATCHES: Record<Exclude<VariantFilter, "all">, (row: InventoryRow) => boolean> = {
  foil: (row) => row.foil,
  signed: (row) => row.signed,
  alt: (row) => skinOf(row) > 0,
};

/** What makes two copies the same *print*: the three cosmetic rolls. Two
 *  copies of a player from different weeks at different ratings are still
 *  the same thing to look at if all three match. */
function printKey(row: InventoryRow): string {
  return `${skinOf(row)}|${row.foil ? "f" : ""}|${row.signed ? "s" : ""}`;
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

/** Showcase order: the ink first, then rating. Same rule the shelf ranks a
 *  player's copies by, so a strip and a filtered wall agree. */
function showcaseOrder(a: InventoryRow, b: InventoryRow): number {
  return Number(b.signed) - Number(a.signed) || b.overall - a.overall || a.id - b.id;
}

const CHIP = "rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel";
const GOLD_CHIP = "rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-gold";

/** The line under a single copy: whose it is, which print run it came from,
 *  what tier it printed at, and every marker that makes it a variant. */
function CopyCaption({
  row,
  count = 1,
  pinned,
}: {
  row: InventoryRow;
  count?: number;
  /** Omitted where the caller can't say — the strip inside a print group
   *  shows a representative copy, and pinning "a representative" would be
   *  a lie about which copy went on display. */
  pinned?: ReadonlySet<number>;
}) {
  const skin = skinOf(row);
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <span className="text-sm font-semibold text-white">
        {row.playerName}
        {count > 1 ? <span className="ml-1.5 text-xs font-bold text-steel">×{count}</span> : null}
      </span>
      <div className="flex flex-wrap justify-center gap-1">
        <span className={CHIP}>{editionLabel(row.editionWeek)}</span>
        <span className={CHIP}>{row.card.tier.label}</span>
        {row.signed ? (
          <span className="rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-gold" title="Autographed copy">
            ✍
          </span>
        ) : null}
        {row.foil ? (
          <span className={GOLD_CHIP} title="Foil copy">
            ✦
          </span>
        ) : null}
        {skin > 0 ? (
          <span className={GOLD_CHIP} title={`Alternate skin #${skin}`}>
            Alt art
          </span>
        ) : null}
      </div>
      {pinned ? <BinderPinButton inventoryId={row.id} pinned={pinned.has(row.id)} playerName={row.playerName} /> : null}
    </div>
  );
}

/** One copy on display, sized and spaced like every other card grid. */
function CopyCell({ row, count, pinned, flame }: { row: InventoryRow; count?: number; pinned?: ReadonlySet<number>; flame?: string | null }) {
  return (
    <div className="card-cell flex flex-col items-center gap-2">
      <PlayerCard3D card={row.card} interactive forceFoil={row.foil} foilType={row.foilType} flame={flame} />
      <CopyCaption row={row} count={count} pinned={pinned} />
    </div>
  );
}

export default function CollectionGrid({
  inventory,
  pinnedIds = [],
  flame = null,
}: {
  inventory: InventoryRow[];
  /** Copies already on display, so the shelf can show which ones are in
   *  the binder without a second round trip per card. */
  pinnedIds?: number[];
  /** The viewer-owner's Patron Flame — this grid only ever shows their own
   *  copies, so one flame covers every card in it. */
  flame?: string | null;
}) {
  const pinned = new Set(pinnedIds);
  const [filter, setFilter] = useState<VariantFilter>("all");
  // Which players have their print strip open. A Set rather than a single
  // slug: comparing two players' prints side by side is the point.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());

  if (inventory.length === 0) {
    return <p className="text-sm text-steel">No cards yet — open your first pack.</p>;
  }

  const counts: Record<VariantFilter, number> = {
    all: inventory.length,
    foil: inventory.filter(MATCHES.foil).length,
    signed: inventory.filter(MATCHES.signed).length,
    alt: inventory.filter(MATCHES.alt).length,
  };

  const chips = (
    <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Variant filter">
      {FILTERS.map(({ key, label }) => (
        <button
          key={key}
          type="button"
          aria-pressed={filter === key}
          // Clicking the active variant chip falls back to the full shelf —
          // the same "click again to clear" the role chips have, except the
          // cleared state here has a name.
          onClick={() => setFilter((current) => (current === key && key !== "all" ? "all" : key))}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
            filter === key ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
          }`}
        >
          {label} · {counts[key]}
        </button>
      ))}
    </div>
  );

  if (filter !== "all") {
    const shown = inventory.filter(MATCHES[filter]).sort(showcaseOrder);
    return (
      <div className="flex flex-col gap-4">
        {chips}
        {shown.length === 0 ? (
          <p className="text-sm text-steel">{EMPTY_COPY[filter]}</p>
        ) : (
          /* card-cell carries its own padding, so the gaps come down by that
             much to sit where the shelf's do. */
          <div className="flex flex-wrap justify-center gap-x-0 gap-y-4">
            {shown.map((row) => (
              <CopyCell key={row.id} row={row} pinned={pinned} flame={flame} />
            ))}
          </div>
        )}
      </div>
    );
  }

  const groups = new Map<string, InventoryRow[]>();
  for (const row of inventory) {
    const copies = groups.get(row.slug) ?? [];
    copies.push(row);
    groups.set(row.slug, copies);
  }

  const owned = [...groups.values()]
    .map((copies) => {
      // Distinct prints, one representative each: the strip is about what a
      // copy looks like, and two identical prints look identical.
      const byPrint = new Map<string, InventoryRow[]>();
      for (const copy of copies) {
        const key = printKey(copy);
        byPrint.set(key, [...(byPrint.get(key) ?? []), copy]);
      }
      return {
        best: copies.reduce(betterCopy),
        count: copies.length,
        foils: copies.filter((copy) => copy.foil).length,
        signatures: copies.filter((copy) => copy.signed).length,
        // Chronological, so the chips read as a print history.
        editions: [...new Set(copies.map((copy) => copy.editionWeek))].sort(),
        prints: [...byPrint.values()]
          .map((prints) => ({ copy: prints.reduce(betterCopy), count: prints.length }))
          .sort((a, b) => showcaseOrder(a.copy, b.copy)),
        // What the dust drawer needs: the flat fields it labels and prices a
        // copy by, plus the frozen print it shows you before you destroy it.
        // No extra payload — this json is already on the client.
        copies: copies
          .map((copy) => ({
            id: copy.id,
            tier: copy.tier,
            foil: copy.foil,
            signed: copy.signed,
            editionWeek: copy.editionWeek,
            card: copy.card,
          }))
          .sort((a, b) => a.editionWeek.localeCompare(b.editionWeek) || a.id - b.id),
      };
    })
    .sort((a, b) => b.best.overall - a.best.overall);

  function togglePrints(slug: string) {
    setExpanded((current) => {
      const next = new Set(current);
      if (!next.delete(slug)) next.add(slug);
      return next;
    });
  }

  return (
    <div className="flex flex-col gap-4">
      {chips}
      {/* card-cell skips the paint for shelves scrolled out of view; it brings its
          own padding, so the gaps come down by that much to sit where they did. */}
      <div className="flex flex-wrap justify-center gap-x-0 gap-y-4">
        {owned.map((entry) => (
          <div key={entry.best.slug} className="card-cell flex flex-col items-center gap-2">
            <PlayerCard3D card={entry.best.card} interactive forceFoil={entry.best.foil} foilType={entry.best.foilType} flame={flame} />
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="text-sm font-semibold text-white">
                {entry.best.playerName}
                {entry.count > 1 ? <span className="ml-1.5 text-xs font-bold text-steel">×{entry.count}</span> : null}
              </span>
              <div className="flex flex-wrap justify-center gap-1">
                {entry.editions.map((week) => (
                  <span key={week} className={CHIP}>
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
                  <span className={GOLD_CHIP} title={`${entry.foils} foil ${entry.foils === 1 ? "copy" : "copies"}`}>
                    {"✦".repeat(entry.foils)}
                  </span>
                ) : null}
              </div>
              {entry.prints.length > 1 ? (
                <button
                  type="button"
                  onClick={() => togglePrints(entry.best.slug)}
                  aria-expanded={expanded.has(entry.best.slug)}
                  className="text-[10px] font-semibold uppercase tracking-wide text-steel underline-offset-4 hover:text-coral hover:underline"
                >
                  {expanded.has(entry.best.slug) ? "Hide prints" : `View prints (${entry.prints.length})`}
                </button>
              ) : null}
              <BinderPinButton
                inventoryId={entry.best.id}
                pinned={pinned.has(entry.best.id)}
                playerName={entry.best.playerName}
              />
              <DustControls playerName={entry.best.playerName} copies={entry.copies} />
            </div>
            {entry.prints.length > 1 && expanded.has(entry.best.slug) ? (
              // Pinned to the card's own width so the strip can't stretch the
              // cell; more than two prints scroll sideways inside it.
              <div className="flex w-80 gap-4 overflow-x-auto pb-2">
                {entry.prints.map((print) => (
                  <div key={printKey(print.copy)} className="flex shrink-0 flex-col items-center gap-2">
                    <PlayerCard3D card={print.copy.card} interactive forceFoil={print.copy.foil} foilType={print.copy.foilType} flame={flame} />
                    <CopyCaption row={print.copy} count={print.count} pinned={pinned} />
                  </div>
                ))}
              </div>
            ) : null}
          </div>
        ))}
      </div>
    </div>
  );
}
