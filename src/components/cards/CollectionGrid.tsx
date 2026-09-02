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

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import type { InventoryRow } from "@/lib/packs/queries";
import { editionLabel } from "@/lib/packs/week";
import { MAX_DUST_BATCH, patronDustValue } from "@/lib/packs/config";
import { fmtPoints } from "@/lib/betting/format";
import { dustManyAction } from "@/lib/trades/actions";
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

const CHIP = "rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-muted";
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
        {count > 1 ? <span className="ml-1.5 text-xs font-bold text-muted">×{count}</span> : null}
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

/**
 * A copy in select mode: the card, and a tap target over the whole cell.
 *
 * The card itself is the button rather than a checkbox beside it — on a
 * phone a 14px tickbox next to a 200px card is the wrong half to aim at,
 * and the cell already reads as one object.
 */
function PickCell({
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
  const disabled = locked || (atCap && !picked);
  return (
    <div className="card-cell flex flex-col items-center gap-2">
      <button
        type="button"
        aria-pressed={picked}
        disabled={disabled}
        onClick={onToggle}
        title={locked ? "On expedition — back soon." : undefined}
        className={`flex flex-col items-center gap-2 rounded-xl border-2 p-1 transition disabled:cursor-not-allowed disabled:opacity-40 ${
          picked ? "border-gold bg-gold/10" : "border-transparent hover:border-gold/40"
        }`}
      >
        <PlayerCard3D card={row.card} forceFoil={row.foil} foilType={row.foilType} flame={flame} />
        <span className="flex w-full items-center justify-center gap-1.5 text-xs">
          <span className="truncate font-semibold text-white">{row.playerName}</span>
          <span className={picked ? "font-bold text-gold" : "text-muted"}>
            {picked ? "✓ " : ""}+{fmtPoints(value)}
          </span>
        </span>
        <span className="text-[10px] uppercase tracking-wide text-muted">
          {locked ? "On expedition" : editionLabel(row.editionWeek)}
        </span>
      </button>
    </div>
  );
}

/** How many cells a shelf mounts at a time. Sized so a normal collection
 *  never sees the button at all, and a big one pays for what it looks at
 *  rather than for everything it owns. */
const PAGE_SIZE = 60;

/** The bottom of a paged shelf. Says what is left rather than just "more",
 *  because "more" cannot tell you whether you are near the end — and it
 *  renders nothing at all once everything is on screen. */
function ShowMore({
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
      <span className="text-xs text-muted">
        {shown.toLocaleString()} of {total.toLocaleString()} {noun}
        {total === 1 ? "" : "s"} · {left.toLocaleString()} more
      </span>
    </div>
  );
}

export default function CollectionGrid({
  inventory,
  pinnedIds = [],
  flame = null,
  deployedIds,
}: {
  inventory: InventoryRow[];
  /** Copies already on display, so the shelf can show which ones are in
   *  the binder without a second round trip per card. */
  pinnedIds?: number[];
  /** The viewer-owner's Patron Flame — this grid only ever shows their own
   *  copies, so one flame covers every card in it. */
  flame?: string | null;
  /** Copies away on an expedition, forwarded to DustControls so a melt
   *  button that the database would refuse is disabled instead of failing.
   *  Passed straight through rather than flattened to an array: the shelf
   *  itself has no use for it. */
  deployedIds?: ReadonlySet<number>;
}) {
  const pinned = new Set(pinnedIds);
  const [filter, setFilter] = useState<VariantFilter>("all");
  // Which players have their print strip open. A Set rather than a single
  // slug: comparing two players' prints side by side is the point.
  const [expanded, setExpanded] = useState<ReadonlySet<string>>(new Set());
  // How many cells are mounted. Every card is a 3D flip with two rendered
  // faces, and a large shelf mounted several hundred of them on first
  // paint — content-visibility skips the PAINT for the ones off screen, but
  // React still builds and hydrates every one. This is the other half of
  // that: the shelf grows a page at a time, and the button says how much is
  // left so nobody has to guess whether they have reached the end.
  const [limit, setLimit] = useState(PAGE_SIZE);
  // A different filter is a different shelf, so it starts at the top again
  // rather than inheriting however far down the last one was opened.
  function chooseFilter(next: VariantFilter) {
    setFilter(next);
    setLimit(PAGE_SIZE);
  }

  // ── Select mode: clearing out duplicates without opening one drawer per
  //   player. DustControls stays exactly as it was — it is the right tool
  //   for "which of my three Dougs", and this is the tool for "these
  //   eleven".
  const router = useRouter();
  const [selecting, setSelecting] = useState(false);
  const [picked, setPicked] = useState<ReadonlySet<number>>(new Set());
  const [armed, setArmed] = useState(false);
  const [dustError, setDustError] = useState<string | null>(null);
  const [dusting, startDust] = useTransition();

  const patron = Boolean(flame);
  /** What a copy dusts for. Same function the server prices with, so the
   *  running total can never quote a number the ledger won't credit. */
  const valueOf = (row: InventoryRow): number =>
    patronDustValue(
      {
        tier: row.tier,
        foil: row.foil,
        foilType: row.foilType,
        signed: row.signed,
        moment: Boolean(row.card.moment),
        champWin: Boolean(row.card.champWin),
        team: Boolean(row.card.team),
      },
      patron,
    );

  function leaveSelectMode() {
    setSelecting(false);
    setPicked(new Set());
    setArmed(false);
    setDustError(null);
  }

  function togglePick(id: number) {
    setArmed(false);
    setDustError(null);
    setPicked((current) => {
      const next = new Set(current);
      if (next.delete(id)) return next;
      // The cap is the server's, imported rather than restated — being
      // told "too many" after the tap is a worse rule than a full basket
      // that stops accepting.
      if (next.size >= MAX_DUST_BATCH) return current;
      next.add(id);
      return next;
    });
  }

  function dustPicked() {
    if (picked.size === 0 || dusting) return;
    if (!armed) {
      // Two taps, always — the same rule the single-copy drawer keeps.
      // There is no undo on the other side of this.
      setArmed(true);
      setDustError(null);
      return;
    }
    setArmed(false);
    const ids = [...picked];
    startDust(async () => {
      const result = await dustManyAction(ids);
      if (!result.ok) {
        setDustError(result.error);
        return;
      }
      setPicked(new Set());
      setDustError(
        result.skipped > 0
          ? `Dusted ${result.dusted} for ${fmtPoints(result.value)}. ${result.skipped} couldn't be sold — a copy in a live lineup or out on an expedition.`
          : null,
      );
      if (result.skipped === 0) setSelecting(false);
      router.refresh();
    });
  }

  if (inventory.length === 0) {
    return <p className="text-sm text-muted">No cards yet — open your first pack.</p>;
  }

  const counts: Record<VariantFilter, number> = {
    all: inventory.length,
    foil: inventory.filter(MATCHES.foil).length,
    signed: inventory.filter(MATCHES.signed).length,
    alt: inventory.filter(MATCHES.alt).length,
  };

  const selectToggle = (
    <button
      type="button"
      onClick={() => (selecting ? leaveSelectMode() : setSelecting(true))}
      aria-pressed={selecting}
      className={`ml-auto rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
        selecting ? "bg-gold text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
      }`}
    >
      {selecting ? "Cancel" : "Select to dust"}
    </button>
  );

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
          onClick={() => chooseFilter(filter === key && key !== "all" ? "all" : key)}
          className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
            filter === key ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
          }`}
        >
          {label} · {counts[key]}
        </button>
      ))}
      {selectToggle}
    </div>
  );

  if (selecting) {
    // Every COPY, not one card per player: a duplicate is a copy, and the
    // whole job here is picking specific copies out of the pile. The
    // variant chips still narrow it, which is how "dust my spare commons"
    // is a two-tap job.
    const shown = (filter === "all" ? inventory : inventory.filter(MATCHES[filter])).slice().sort(showcaseOrder);
    const total = shown.filter((row) => picked.has(row.id)).reduce((sum, row) => sum + valueOf(row), 0);
    return (
      <div className="flex flex-col gap-4">
        {chips}
        <p className="text-xs text-muted">
          Tap the copies you want gone. {MAX_DUST_BATCH} at a time; a copy in a live lineup or out on an
          expedition can&apos;t be dusted and the shelf will say so.
        </p>
        <div className="flex flex-wrap justify-center gap-x-0 gap-y-4">
          {shown.slice(0, limit).map((row) => (
            <PickCell
              key={row.id}
              row={row}
              picked={picked.has(row.id)}
              locked={deployedIds?.has(row.id) ?? false}
              atCap={picked.size >= MAX_DUST_BATCH}
              flame={flame}
              value={valueOf(row)}
              onToggle={() => togglePick(row.id)}
            />
          ))}
        </div>
        <ShowMore
          shown={Math.min(limit, shown.length)}
          total={shown.length}
          onMore={() => setLimit((n) => n + PAGE_SIZE)}
          noun="card"
        />
        {dustError ? (
          <p role="alert" className="text-sm text-red-400">
            {dustError}
          </p>
        ) : null}
        {/* Sticky, because the selection is made by scrolling and a button
            at the bottom of four hundred cards is a button nobody finds. */}
        <div className="sticky bottom-3 z-10 flex flex-wrap items-center gap-3 rounded-xl border border-gold/50 bg-canvas/95 px-4 py-3 shadow-lg">
          <span className="text-sm font-semibold text-white">
            {picked.size} selected
            {picked.size >= MAX_DUST_BATCH ? <span className="ml-1 text-xs text-muted">(max)</span> : null}
          </span>
          <span className="text-sm font-bold text-gold">+{fmtPoints(total)}</span>
          {picked.size > 0 ? (
            <button
              type="button"
              onClick={() => setPicked(new Set())}
              className="text-xs font-semibold uppercase tracking-wide text-muted underline-offset-4 hover:text-white hover:underline"
            >
              Clear
            </button>
          ) : null}
          <button
            type="button"
            onClick={dustPicked}
            disabled={picked.size === 0 || dusting}
            className="ml-auto rounded-full border border-gold/60 bg-gold/10 px-5 py-2 text-sm font-semibold text-gold transition hover:bg-gold/20 disabled:cursor-not-allowed disabled:opacity-50"
          >
            {dusting
              ? "Dusting…"
              : armed
                ? `Dust ${picked.size} — sure?`
                : `Dust selected — +${fmtPoints(total)}`}
          </button>
        </div>
      </div>
    );
  }

  if (filter !== "all") {
    const shown = inventory.filter(MATCHES[filter]).sort(showcaseOrder);
    return (
      <div className="flex flex-col gap-4">
        {chips}
        {shown.length === 0 ? (
          <p className="text-sm text-muted">{EMPTY_COPY[filter]}</p>
        ) : (
          <>
            {/* card-cell carries its own padding, so the gaps come down by
                that much to sit where the shelf's do. */}
            <div className="flex flex-wrap justify-center gap-x-0 gap-y-4">
              {shown.slice(0, limit).map((row) => (
                <CopyCell key={row.id} row={row} pinned={pinned} flame={flame} />
              ))}
            </div>
            <ShowMore shown={Math.min(limit, shown.length)} total={shown.length} onMore={() => setLimit((n) => n + PAGE_SIZE)} noun="card" />
          </>
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
        {owned.slice(0, limit).map((entry) => (
          <div key={entry.best.slug} className="card-cell flex flex-col items-center gap-2">
            <PlayerCard3D card={entry.best.card} interactive forceFoil={entry.best.foil} foilType={entry.best.foilType} flame={flame} />
            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="text-sm font-semibold text-white">
                {entry.best.playerName}
                {entry.count > 1 ? <span className="ml-1.5 text-xs font-bold text-muted">×{entry.count}</span> : null}
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
                  className="text-[10px] font-semibold uppercase tracking-wide text-muted underline-offset-4 hover:text-action-text hover:underline"
                >
                  {expanded.has(entry.best.slug) ? "Hide prints" : `View prints (${entry.prints.length})`}
                </button>
              ) : null}
              <BinderPinButton
                inventoryId={entry.best.id}
                pinned={pinned.has(entry.best.id)}
                playerName={entry.best.playerName}
              />
              <DustControls
                playerName={entry.best.playerName}
                copies={entry.copies}
                patron={Boolean(flame)}
                deployedIds={deployedIds}
              />
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
      <ShowMore shown={Math.min(limit, owned.length)} total={owned.length} onMore={() => setLimit((n) => n + PAGE_SIZE)} noun="player" />
    </div>
  );
}
