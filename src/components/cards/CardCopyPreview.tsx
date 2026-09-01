"use client";

// "Which copy is that, exactly?" — the answer, as the card itself.
//
// Everywhere a copy is summarized as a line of text (a trade chip, a checkbox
// row) the thing that makes it worth trading is invisible: the skin it
// printed in, the holograph, the ink. This is the trigger + overlay pair that
// puts the actual rendered copy on screen for a moment, so a trader agrees to
// a card they've seen rather than a card they've read about.
//
// The frozen json can arrive two ways, because the two callers have opposite
// payload problems:
//   `card`     — already on the client (a trade names ~40 copies at most, and
//                your own shelf is small enough to ship whole).
//   `loadCard` — fetched the first time this preview opens, then kept. A
//                partner's collection runs to hundreds of copies and almost
//                none of them get looked at; shipping every frozen card up
//                front to render one is the trade this avoids.
//
// One overlay per instance, mounted only while open — there is no shared
// portal to coordinate, and a card that isn't on screen costs nothing.

import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import type { PlayerCardData } from "@/lib/cards/build";
import { editionLabel } from "@/lib/packs/week";
import { tierLabel } from "@/lib/cards/tier";
import PlayerCard3D from "./PlayerCard3D";

const CHIP =
  "rounded-full border border-line bg-panel px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-steel";
const GOLD_CHIP =
  "rounded-full border border-gold/50 bg-gold/10 px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-gold";

/** The line under the card: which copy this is, in words. Same vocabulary as
 *  the collection shelf's captions (src/components/cards/CollectionGrid.tsx). */
export interface CopyCaption {
  playerName: string;
  /** Monday of the print run, "" when unknown. */
  editionWeek?: string;
  /** Raw tier key ("gold"), labelled here. */
  tier?: string;
  foil?: boolean;
  signed?: boolean;
  altArt?: boolean;
  /** This copy's stamp within its print run. */
  printNumber?: number | null;
  /** How many copies that print has ever stamped — the "of 43". Shown only
   *  together with printNumber: a serial with no denominator, or a run size
   *  attached to no serial, is a number nobody can read. */
  printRun?: number | null;
}

// Re-exported so the existing client callers keep their import; the
// implementation lives in a directive-free module because Server Components
// need it too.
export { tierLabel };

export default function CardCopyPreview({
  card = null,
  loadCard,
  loadProvenance,
  foil = false,
  foilType = null,
  caption,
  label,
  className = "",
  children,
}: {
  /** The frozen copy, when the caller already holds it. */
  card?: PlayerCardData | null;
  /** Fetches the frozen copy on first open. Resolve null to say it's gone. */
  loadCard?: () => Promise<PlayerCardData | null>;
  /** Fetches this copy's chain of custody, already turned into lines
   *  (describeProvenance), the first time the preview opens. Omitted
   *  everywhere the panel doesn't belong — a builder's checkbox row is
   *  picking cards, not researching them — so the whole section is absent
   *  rather than empty for those callers. Resolve null to say it couldn't
   *  be read; resolve [] to say there is nothing recorded. */
  loadProvenance?: () => Promise<string[] | null>;
  /** Holograph the card whatever its tier — this copy's own foil roll. */
  foil?: boolean;
  /** Which parallel that roll produced. */
  foilType?: string | null;
  caption: CopyCaption;
  /** Accessible name for the trigger, when the chip's own text isn't one. */
  label?: string;
  /** Classes for the trigger button — it looks like whatever it wraps. */
  className?: string;
  children: ReactNode;
}) {
  const [open, setOpen] = useState(false);
  // Fetched once and kept: re-opening the same row must not hit the server
  // again, and this component outlives every open/close of its own overlay.
  const [fetched, setFetched] = useState<PlayerCardData | null>(null);
  const [loading, setLoading] = useState(false);
  const [failed, setFailed] = useState(false);
  // The chain, kept for the life of the component like the card is — a
  // copy's history is settled, so re-opening the same preview must not ask
  // the server for it a second time. Undefined means "not asked yet", null
  // means "asked, and it couldn't be read".
  const [chain, setChain] = useState<string[] | null | undefined>(undefined);
  const [chainLoading, setChainLoading] = useState(false);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const closeRef = useRef<HTMLButtonElement | null>(null);

  const shown = card ?? fetched;

  const close = useCallback(() => {
    setOpen(false);
    // Back where the reader was — the chip they opened, not the top of the
    // document, which is where an unmanaged overlay drops focus.
    triggerRef.current?.focus();
  }, []);

  useEffect(() => {
    if (!open) return;
    closeRef.current?.focus();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") close();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open, close]);

  function openPreview() {
    setOpen(true);
    // The chain is its own request, fired beside the card's rather than
    // after it: they are independent reads and a copy whose json is
    // already on the client would otherwise wait for nothing.
    if (loadProvenance && chain === undefined && !chainLoading) {
      setChainLoading(true);
      loadProvenance()
        .then((lines) => setChain(lines))
        .catch(() => setChain(null))
        .finally(() => setChainLoading(false));
    }
    if (shown || loading || !loadCard) return;
    setLoading(true);
    setFailed(false);
    loadCard()
      .then((result) => {
        setFetched(result);
        setFailed(result === null);
      })
      .catch(() => setFailed(true))
      .finally(() => setLoading(false));
  }

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        onClick={openPreview}
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-label={label}
        title={`View ${caption.playerName}'s card`}
        className={className}
      >
        {children}
      </button>

      {open ? (
        <div
          // Backdrop click closes, so the whole sheet takes the handler and
          // the card's own wrapper stops the bubble.
          onClick={close}
          role="dialog"
          aria-modal="true"
          aria-label={`${caption.playerName} — card preview`}
          data-testid="card-preview"
          className="fixed inset-0 z-50 flex items-center justify-center overflow-y-auto bg-black/75 p-4 backdrop-blur-sm"
        >
          <div className="my-auto flex flex-col items-center gap-3" onClick={(event) => event.stopPropagation()}>
            <button
              ref={closeRef}
              type="button"
              onClick={close}
              aria-label="Close card preview"
              className="self-end rounded-full border border-line bg-panel px-2.5 py-1 text-xs font-bold text-steel transition hover:border-coral hover:text-coral"
            >
              ✕
            </button>

            {shown ? (
              <PlayerCard3D card={shown} interactive gyro forceFoil={foil} foilType={foilType} />
            ) : (
              <p className="w-72 rounded-xl border border-line bg-panel p-6 text-center text-sm text-steel">
                {failed ? "That card couldn't be loaded — it may have moved on." : "Loading the card…"}
              </p>
            )}

            <div className="flex flex-col items-center gap-1.5 text-center">
              <span className="text-sm font-semibold text-white">{caption.playerName}</span>
              <div className="flex flex-wrap justify-center gap-1">
                {caption.editionWeek ? <span className={CHIP}>{editionLabel(caption.editionWeek)}</span> : null}
                {caption.tier ? <span className={CHIP}>{tierLabel(caption.tier)}</span> : null}
                {caption.printNumber && caption.printRun ? (
                  <span
                    className={CHIP}
                    title={`Copy ${caption.printNumber} of the ${caption.printRun} this print has ever stamped`}
                  >
                    #{caption.printNumber} of {caption.printRun}
                  </span>
                ) : null}
                {caption.signed ? (
                  <span
                    className="rounded-full border border-gold bg-gold/20 px-2 py-0.5 text-[10px] font-black tracking-[0.2em] text-gold"
                    title="Autographed copy"
                  >
                    ✍
                  </span>
                ) : null}
                {caption.foil ? (
                  <span className={GOLD_CHIP} title="Foil copy">
                    ✦
                  </span>
                ) : null}
                {caption.altArt ? (
                  <span className={GOLD_CHIP} title="Alternate art print">
                    Alt art
                  </span>
                ) : null}
              </div>

              {/* Where this copy has been. Only rendered for callers that
                  asked for it, and only once it has something to say — a
                  panel that appears empty on every card reads as broken,
                  where an absent one reads as "not that kind of view". */}
              {loadProvenance ? (
                <div className="mt-1 flex flex-col items-center gap-1" data-testid="provenance">
                  <span className="text-[9px] font-bold uppercase tracking-[0.2em] text-steel">Provenance</span>
                  {chainLoading ? (
                    <span className="text-xs text-steel">Reading the chain…</span>
                  ) : chain === null ? (
                    <span className="text-xs text-steel">Its history couldn&apos;t be read.</span>
                  ) : chain && chain.length > 0 ? (
                    <ol className="flex flex-col items-center gap-0.5">
                      {chain.map((entry, index) => (
                        <li key={`${index}-${entry}`} className="text-xs text-steel">
                          {entry}
                        </li>
                      ))}
                    </ol>
                  ) : (
                    <span className="text-xs text-steel">Nothing recorded for this copy.</span>
                  )}
                </div>
              ) : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
