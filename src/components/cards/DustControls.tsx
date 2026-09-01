"use client";

// Dusting: sell a duplicate copy back for betting dollars.
//
// The shelf above shows one entry per player — the best copy — which is
// exactly the wrong granularity for destroying something. So this drawer
// opens the stack: every copy you own of that player, listed individually
// with the print run it came from and what it dusts for, because "dust a
// duplicate" is a decision about a specific copy and the ✍ signed one is
// never the copy you meant.
//
// Two clicks, always. The first arms one copy ("Confirm $25?"), the second
// destroys it — arming any other copy disarms the first, so a stray click
// can't cascade down the list. There is no undo on the other side of this,
// which is the whole reason for the second click.
//
// Locked copies (fielded in a lineup that hasn't been graded) are NOT
// precomputed here: the lineup can change between render and click, so the
// server action is the only thing that can answer honestly and its error is
// surfaced inline instead.
//
// And because the decision is about a specific copy, the row SHOWS it: a
// thumbnail of the art this copy actually printed in, plus a ⤢ that opens
// the copy full-size. "Dust · $120" next to a line of text is a number
// attached to nothing — the whole reason to keep a duplicate is usually the
// skin it wears, and you can't weigh that against $120 by reading it.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import type { PlayerCardData } from "@/lib/cards/build";
import { championCenteredUrl, championSplashUrl } from "@/lib/match-draft/champions";
import { canDust, patronDustValue } from "@/lib/packs/config";
import { editionLabel } from "@/lib/packs/week";
import { dustCardAction } from "@/lib/trades/actions";
import { rerollPrintAction } from "@/lib/cards/reroll-actions";
import CardCopyPreview, { tierLabel } from "./CardCopyPreview";
import { provenanceLinesFor } from "./provenanceLines";

/** One owned copy: the flat fields the value table and the labels read, plus
 *  the frozen print itself — the only place a copy's art, ink and holograph
 *  are recorded, and so the only way to show the reader what they're about
 *  to destroy. All serializable; CollectionGrid already holds it client-side. */
export interface DustCopy {
  id: number;
  tier: string;
  foil: boolean;
  /** Which parallel. Optional for the callers that predate parallels; the
   *  one value that changes the drawer's behaviour is 'eclipse', which
   *  cannot be dusted at all. */
  foilType?: string | null;
  signed: boolean;
  editionWeek: string;
  card: PlayerCardData;
  /** This copy's stamp and the size of its print run, when the shelf above
   *  knows them. Optional: a page that hasn't read the counters shows the
   *  same drawer, minus one chip. */
  printNumber?: number | null;
  printRun?: number | null;
}

/** The art this copy printed in — the signature champion in whichever skin
 *  the pull rolled. Same chain PlayerCard3D's front uses, minus the base-art
 *  last resort: a thumbnail that quietly shows the wrong skin would be worse
 *  than no thumbnail, so this one just leaves. */
function copyArtUrl(card: PlayerCardData): string | null {
  return card.signature ? championCenteredUrl(card.signature.champion, card.artSkin) : null;
}

export default function DustControls({
  playerName,
  copies,
  patron = false,
  deployedIds,
}: {
  playerName: string;
  copies: DustCopy[];
  /** Active patron — shows the weekly art re-roll die on each copy. */
  patron?: boolean;
  /** Copies currently away on an expedition. A courtesy layer only:
   *  card_inventory_expedition_guard refuses the delete outright, so
   *  omitting this costs a confusing error, never a lost card. The re-roll
   *  die is deliberately NOT gated — it rewrites `card`, which the guard
   *  (delete + update of discord_id) does not touch, and redecorating a
   *  copy while it is out is harmless. */
  deployedIds?: ReadonlySet<number>;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [armed, setArmed] = useState<number | null>(null);
  // The re-roll die arms separately from dusting — the two must never
  // share a confirm state, one destroys and one redecorates.
  const [dieArmed, setDieArmed] = useState<number | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  // Copies whose art Riot serves from neither directory — the thumb drops
  // out rather than leaving a broken-image box in a destructive row.
  const [artless, setArtless] = useState<ReadonlySet<number>>(new Set());

  if (copies.length === 0) return null;

  function toggle() {
    setOpen((wasOpen) => !wasOpen);
    setArmed(null);
    setError(null);
  }

  function handleReroll(copy: DustCopy) {
    setError(null);
    setArmed(null);
    if (dieArmed !== copy.id) {
      setDieArmed(copy.id); // first click arms — the die is weekly, don't waste it
      return;
    }
    setDieArmed(null);
    startTransition(async () => {
      const result = await rerollPrintAction(copy.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      router.refresh();
    });
  }

  function handleDust(copy: DustCopy) {
    setError(null);
    setDieArmed(null);
    if (armed !== copy.id) {
      setArmed(copy.id); // first click only arms — nothing is destroyed yet
      return;
    }
    setArmed(null);
    startTransition(async () => {
      const result = await dustCardAction(copy.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      // The grid is server-rendered, so the shelf only learns the copy is
      // gone on a refresh.
      router.refresh();
    });
  }

  return (
    <div className="flex w-full flex-col items-center gap-1.5">
      <button
        type="button"
        onClick={toggle}
        aria-expanded={open}
        className="text-[10px] font-semibold uppercase tracking-wide text-steel underline-offset-4 hover:text-coral hover:underline"
      >
        {open ? "Hide copies" : "Manage copies"}
      </button>

      {open ? (
        <ul className="flex w-full flex-col gap-1">
          {copies.map((copy) => {
            // Patrons melt for 20% more — same helper the server credits by.
            const value = patronDustValue(copy, patron);
            const deployed = deployedIds?.has(copy.id) ?? false;
            // A one-of-one has no dust value to quote. The server refuses it
            // anyway; the button saying so first is what stops a price that
            // reads as a real offer from sitting under the rarest card there is.
            const keepsake = !canDust(copy);
            const isArmed = armed === copy.id;
            const art = artless.has(copy.id) ? null : copyArtUrl(copy.card);
            const describe = `${editionLabel(copy.editionWeek)} ${tierLabel(copy.tier)} copy of ${playerName}`;
            return (
              <li
                key={copy.id}
                className="flex items-center justify-between gap-2 rounded-md border border-line bg-panel px-2 py-1"
              >
                {art ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={art}
                    alt=""
                    aria-hidden
                    loading="lazy"
                    className="h-7 w-10 shrink-0 rounded-sm border border-line object-cover object-[center_20%]"
                    onError={(event) => {
                      // Centered art missing → the same skin's regular splash
                      // before giving up. The stage rides the element so a
                      // second failure can't loop (same as SkinPicker's).
                      const img = event.currentTarget;
                      const fallback = copy.card.signature
                        ? championSplashUrl(copy.card.signature.champion, copy.card.artSkin)
                        : null;
                      if (fallback && img.dataset.artStage !== "1") {
                        img.dataset.artStage = "1";
                        img.src = fallback;
                        return;
                      }
                      setArtless((current) => new Set(current).add(copy.id));
                    }}
                  />
                ) : null}
                <span className="flex min-w-0 flex-1 flex-wrap items-center gap-1 text-[10px] text-steel">
                  <span className="font-semibold uppercase tracking-wide">{editionLabel(copy.editionWeek)}</span>
                  <span>{tierLabel(copy.tier)}</span>
                  {copy.signed ? (
                    <span className="font-black text-gold" title="Autographed copy">
                      ✍
                    </span>
                  ) : null}
                  {copy.foil ? (
                    <span className="font-black text-gold" title="Foil copy">
                      ✦
                    </span>
                  ) : null}
                </span>
                {patron && !copy.card.moment ? (
                  <button
                    type="button"
                    onClick={() => handleReroll(copy)}
                    disabled={pending}
                    title="Patron perk: re-roll this copy's art (one per week, skin only — never rarity, foil or ink)"
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[10px] font-semibold transition disabled:opacity-40 ${
                      dieArmed === copy.id ? "bg-gold text-navy" : "text-steel hover:text-gold"
                    }`}
                  >
                    {dieArmed === copy.id ? "Roll it?" : "🎲"}
                  </button>
                ) : null}
                <CardCopyPreview
                  card={copy.card}
                  foil={copy.foil}
                  // The drawer is where a collector looks hardest at one
                  // copy — it is the last screen before destroying it — so
                  // it is where the chain of custody belongs.
                  loadProvenance={() => provenanceLinesFor(copy.id)}
                  caption={{
                    playerName,
                    editionWeek: copy.editionWeek,
                    tier: copy.tier,
                    foil: copy.foil,
                    signed: copy.signed,
                    altArt: copy.card.artSkin > 0,
                    printNumber: copy.printNumber ?? null,
                    printRun: copy.printRun ?? null,
                  }}
                  label={`Look at the ${describe}`}
                  className="shrink-0 rounded-full border border-line px-1.5 py-0.5 text-[10px] font-bold text-steel transition hover:border-coral hover:text-coral"
                >
                  ⤢
                </CardCopyPreview>
                <button
                  type="button"
                  onClick={() => handleDust(copy)}
                  disabled={pending || deployed || keepsake}
                  title={
                    keepsake
                      ? "An Eclipse is a one-of-one — it can't be dusted, but you can trade it."
                      : deployed
                        ? "On expedition — back soon."
                        : undefined
                  }
                  aria-label={`Dust the ${describe}`}
                  className={`shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide disabled:cursor-not-allowed disabled:opacity-60 ${
                    isArmed
                      ? "border-coral bg-coral/20 text-coral"
                      : "border-line text-steel hover:border-coral hover:text-coral"
                  }`}
                >
                  {keepsake
                    ? "1 of 1"
                    : deployed
                      ? "On expedition"
                      : isArmed
                        ? `Confirm ${fmtPoints(value)}?`
                        : `Dust · ${fmtPoints(value)}`}
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}

      {error ? <p className="text-[10px] text-red-400">{error}</p> : null}
    </div>
  );
}
