// The collection shelf's cells: a copy on display with the caption under
// it, a copy in select mode, and the paging footer. CollectionGrid.tsx
// lays them out.

import { copyEditionLabel } from "@/lib/cards/copyEdition";
import type { InventoryRow } from "@/lib/packs/queries";
import { canDust, FOIL_TYPE_LABELS, foilTypeOf } from "@/lib/packs/config";
import { fmtPoints } from "@/lib/betting/format";
import BinderPinButton from "./BinderPinButton";
import PlayerCard3D from "./PlayerCard3D";
import { parallelLabelFor, seasonLineOf } from "@/lib/cards/skinLines";
import { isEclipse, parallelOf, printOf, skinOf } from "./collectionShelf";

export const CHIP = "rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel";
export const GOLD_CHIP = "rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-gold";

/** The line under a single copy: whose it is, which print run it came from,
 *  what tier it printed at, and every marker that makes it a variant. */
export function CopyCaption({
  row,
  count = 1,
  pinned,
  printRuns,
}: {
  row: InventoryRow;
  count?: number;
  /** Omitted where the caller can't say — the strip inside a print group
   *  shows a representative copy, and pinning "a representative" would be
   *  a lie about which copy went on display. */
  pinned?: ReadonlySet<number>;
  /** Minted-to-date per print, keyed by printRunKey. Optional throughout:
   *  a shelf whose page hasn't read the counters still renders, it just
   *  doesn't say which copy this is. */
  printRuns?: ReadonlyMap<string, number>;
}) {
  const skin = skinOf(row);
  const print = printOf(row, printRuns);
  return (
    <div className="flex flex-col items-center gap-1.5 text-center">
      <span className="text-sm font-semibold text-white">
        {row.playerName}
        {count > 1 ? <span className="ml-1.5 text-xs font-bold text-steel">×{count}</span> : null}
      </span>
      <div className="flex flex-wrap justify-center gap-1">
        <span className={CHIP}>{copyEditionLabel(row.editionWeek, row.card)}</span>
        <span className={CHIP}>{row.card.tier.label}</span>
        {print ? (
          <span
            className={CHIP}
            title={`Copy ${print.number} of the ${print.of} this print has ever stamped`}
          >
            #{print.number} of {print.of}
          </span>
        ) : null}
        {row.signed ? (
          <span className="rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-gold" title="Autographed copy">
            ✍
          </span>
        ) : null}
        {isEclipse(row) ? (
          <span className={GOLD_CHIP} title="Eclipse — the only copy of this print that will ever exist">
            ◐ 1 of 1
          </span>
        ) : row.foil ? (
          <span className={GOLD_CHIP} title={`${parallelLabelFor(row.season, foilTypeOf(row.foilType), FOIL_TYPE_LABELS[foilTypeOf(row.foilType)])} foil copy`}>
            {/* The parallel by name where it is more than the base foil —
                a Cracked Ice beside a Prisma should not wear the same ✦.
                Under a season line every tier is named, Standard too. */}
            {parallelOf(row) || seasonLineOf(row.season)
              ? parallelLabelFor(row.season, foilTypeOf(row.foilType), FOIL_TYPE_LABELS[foilTypeOf(row.foilType)])
              : "✦"}
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
export function CopyCell({
  row,
  count,
  pinned,
  flame,
  printRuns,
}: {
  row: InventoryRow;
  count?: number;
  pinned?: ReadonlySet<number>;
  flame?: string | null;
  printRuns?: ReadonlyMap<string, number>;
}) {
  return (
    <div className="card-cell flex flex-col items-center gap-2">
      <PlayerCard3D
        card={row.card}
        interactive
        forceFoil={row.foil}
        foilType={row.foilType}
        flame={flame}
        print={printOf(row, printRuns)}
      />
      <CopyCaption row={row} count={count} pinned={pinned} printRuns={printRuns} />
    </div>
  );
}

/**
 * A copy in select mode: the card, and a tap target over the whole cell.
 *
 * The card itself is the button rather than a checkbox beside it — on a
 * phone a 14px tickbox next to a 200px card is the wrong half to aim at,
 * and the cell already reads as one object.
 */
export function PickCell({
  row,
  picked,
  locked,
  atCap,
  flame,
  value,
  onToggle,
}: {
  row: InventoryRow;
  picked: boolean;
  /** Away on an expedition — the database would refuse the delete, so the
   *  cell says why instead of failing on tap. */
  locked: boolean;
  /** The batch is full and this copy is not in it. */
  atCap: boolean;
  flame?: string | null;
  value: number;
  onToggle: () => void;
}) {
  // A one-of-one is never pickable for dust — not a situation like a lock
  // that lifts when the expedition returns, but a property of the copy.
  const keepsake = !canDust(row);
  const disabled = locked || keepsake || (atCap && !picked);
  return (
    <div className="card-cell flex flex-col items-center gap-2">
      <button
        type="button"
        aria-pressed={picked}
        disabled={disabled}
        onClick={onToggle}
        title={
          keepsake
            ? "An Eclipse is a one-of-one — it can't be dusted, but you can trade it."
            : locked
              ? "On expedition — back soon."
              : undefined
        }
        className={`flex flex-col items-center gap-2 rounded-xl border-2 p-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
          picked ? "border-gold bg-gold/10" : "border-transparent hover:border-gold/40"
        }`}
      >
        <PlayerCard3D card={row.card} forceFoil={row.foil} foilType={row.foilType} flame={flame} />
        <span className="flex w-full items-center justify-center gap-1.5 text-xs">
          <span className="truncate font-semibold text-white">{row.playerName}</span>
          <span className={picked ? "font-bold text-gold" : "text-steel"}>
            {keepsake ? "1 of 1" : `${picked ? "✓ " : ""}+${fmtPoints(value)}`}
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-wide text-steel">
          {keepsake ? "Can't be dusted" : locked ? "On expedition" : copyEditionLabel(row.editionWeek, row.card)}
        </span>
      </button>
    </div>
  );
}

/** The bottom of a paged shelf. Says what is left rather than just "more",
 *  because "more" cannot tell you whether you are near the end — and it
 *  renders nothing at all once everything is on screen. */
export function ShowMore({
  shown,
  total,
  onMore,
  noun,
}: {
  shown: number;
  total: number;
  onMore: () => void;
  noun: string;
}) {
  if (shown >= total) return null;
  const left = total - shown;
  return (
    <div className="flex flex-col items-center gap-1.5">
      <button type="button" onClick={onMore} className="btn-pill px-5 py-2 text-sm">
        Show more
      </button>
      <span className="text-xs text-steel">
        {shown.toLocaleString()} of {total.toLocaleString()} {noun}
        {total === 1 ? "" : "s"} · {left.toLocaleString()} more
      </span>
    </div>
  );
}
