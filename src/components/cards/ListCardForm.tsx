"use client";

// Putting a copy up for sale: pick one off your shelf, name a price, post it.
//
// The picker is TradeBuilder's option list in a single-select shape — same
// `TradeCardOption` rows, same view button on each one — because the decision
// is the same decision ("which of these am I parting with?") and learning two
// different pickers for it would be two things to learn.
//
// Copies that cannot be delivered are shown and disabled rather than filtered
// out. A card missing from the list looks like a bug; a card greyed with "on
// expedition" next to it is an explanation. `createListing` re-checks every
// one of these server-side — nothing here is authoritative, and the action's
// error renders inline rather than being pre-empted by a disabled button.

import { useMemo, useState, useTransition } from "react";
import EmptyShelf from "./EmptyShelf";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import { editionLabel } from "@/lib/packs/week";
import { createListing } from "@/lib/market/actions";
import { MAX_LISTING_ASK, MAX_NOTE_CHARS, LISTING_DAYS } from "@/lib/market/config";
import { fetchInventoryCardAction } from "@/lib/trades/actions";
import CardCopyPreview, { tierLabel } from "./CardCopyPreview";
import type { TradeCardOption } from "./TradeBuilder";

/** Best card first — the same order the trade builder puts a shelf in. */
function byValue(a: TradeCardOption, b: TradeCardOption): number {
  return b.overall - a.overall || a.playerName.localeCompare(b.playerName);
}

/** A "" / "500" input as dollars, or null if it isn't a whole number. */
export function parseAsk(raw: string): number | null {
  const trimmed = raw.trim();
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** Why this copy can't go up, or "" when it can. Presentation only — the
 *  action decides for real. */
export function unavailableReason(
  id: number,
  deployedIds?: ReadonlySet<number>,
  listedIds?: ReadonlySet<number>,
): string {
  if (listedIds?.has(id)) return "Already listed";
  if (deployedIds?.has(id)) return "On expedition";
  return "";
}

export default function ListCardForm({
  inventory,
  deployedIds,
  listedIds,
  initialInventoryId = null,
  base = "/cards",
}: {
  inventory: TradeCardOption[];
  /** Your copies out on an expedition — they cannot change hands. */
  deployedIds?: ReadonlySet<number>;
  /** Your copies already on the market — one open listing per copy. */
  listedIds?: ReadonlySet<number>;
  /** The copy to open the form on — the shelf's "Sell" action lands here
   *  with ?sell=<id>. A hint, not a permission: ignored unless the copy is
   *  yours and free to list. */
  initialInventoryId?: number | null;
  /** "/cards" or "/academy/cards", for the empty shelf's pack link. */
  base?: string;
}) {
  const router = useRouter();
  const [chosen, setChosen] = useState<number | null>(() =>
    initialInventoryId !== null &&
    inventory.some((card) => card.id === initialInventoryId) &&
    !unavailableReason(initialInventoryId, deployedIds, listedIds)
      ? initialInventoryId
      : null,
  );
  const [ask, setAsk] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [busy, startPosting] = useTransition();

  const cards = useMemo(() => [...inventory].sort(byValue), [inventory]);

  function post() {
    setError(null);
    setPosted(null);
    if (chosen === null) {
      setError("Pick a card to sell.");
      return;
    }
    const price = parseAsk(ask);
    if (price === null || price < 1 || price > MAX_LISTING_ASK) {
      setError(`An ask has to be a whole number from $1 to ${fmtPoints(MAX_LISTING_ASK)}.`);
      return;
    }
    if (note.trim().length > MAX_NOTE_CHARS) {
      setError(`Notes are capped at ${MAX_NOTE_CHARS} characters.`);
      return;
    }
    startPosting(async () => {
      const result = await createListing({ inventoryId: chosen, ask: price, note });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setChosen(null);
      setAsk("");
      setNote("");
      setPosted(`Listed for ${fmtPoints(price)} — it stands for ${LISTING_DAYS} days.`);
      router.refresh();
    });
  }

  return (
    <div className="card-brand flex flex-col gap-4 p-5" data-testid="list-card-form">
      {cards.length === 0 ? (
        <EmptyShelf base={base} goal="put one up for sale" />
      ) : (
        <>
          <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1" data-testid="sell-picker">
            {cards.map((card) => {
              const reason = unavailableReason(card.id, deployedIds, listedIds);
              return (
                <li key={card.id} className="flex items-stretch gap-1">
                  <label
                    title={reason || undefined}
                    className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border border-line bg-panel px-2 py-1 text-[11px] ${
                      reason ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-coral/60"
                    }`}
                  >
                    <input
                      type="radio"
                      name="listing-card"
                      checked={chosen === card.id}
                      disabled={busy || reason !== ""}
                      onChange={() => {
                        setChosen(card.id);
                        setPosted(null);
                      }}
                      aria-label={`${card.playerName} ${card.overall} ${editionLabel(card.editionWeek)}`}
                      className="accent-coral"
                    />
                    <span className="min-w-0 flex-1 truncate font-semibold text-white">{card.playerName}</span>
                    <span className="font-mono font-bold text-mint">{card.overall}</span>
                    <span className="text-steel">{tierLabel(card.tier)}</span>
                    <span className="text-steel">{editionLabel(card.editionWeek)}</span>
                    {card.signed ? (
                      <span className="font-black text-gold" title="Autographed copy">
                        ✍
                      </span>
                    ) : null}
                    {card.foil ? (
                      <span className="font-black text-gold" title="Foil copy">
                        ✦
                      </span>
                    ) : null}
                    {reason ? (
                      <span className="shrink-0 whitespace-nowrap font-semibold uppercase tracking-wide text-steel">
                        {reason}
                      </span>
                    ) : null}
                  </label>
                  <CardCopyPreview
                    card={card.card ?? null}
                    loadCard={async () => {
                      const result = await fetchInventoryCardAction(card.id);
                      return result.ok ? result.card : null;
                    }}
                    foil={card.foil}
                    caption={{
                      playerName: card.playerName,
                      editionWeek: card.editionWeek,
                      tier: card.tier,
                      foil: card.foil,
                      signed: card.signed,
                      altArt: card.altArt,
                    }}
                    label={`View ${card.playerName}'s card`}
                    className="shrink-0 rounded-md border border-line bg-panel px-2 text-[11px] text-steel transition hover:border-coral hover:text-coral focus-visible:border-coral focus-visible:outline-none"
                  >
                    <span aria-hidden>⤢</span>
                  </CardCopyPreview>
                </li>
              );
            })}
          </ul>

          <div className="flex flex-wrap items-end gap-3 border-t border-line pt-3">
            <label className="flex flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-steel">Ask</span>
              <input
                className="input-brand w-28 p-1.5 text-sm"
                inputMode="numeric"
                placeholder="500"
                value={ask}
                disabled={busy}
                aria-label="Asking price"
                onChange={(event) => setAsk(event.target.value)}
              />
            </label>
            <label className="flex min-w-0 flex-1 flex-col gap-1">
              <span className="text-[11px] uppercase tracking-wide text-steel">
                Note (optional, {MAX_NOTE_CHARS} characters)
              </span>
              <input
                className="input-brand w-full p-1.5 text-sm"
                placeholder="will take offers"
                maxLength={MAX_NOTE_CHARS}
                value={note}
                disabled={busy}
                aria-label="Listing note"
                onChange={(event) => setNote(event.target.value)}
              />
            </label>
            <button
              type="button"
              onClick={post}
              disabled={busy}
              className="btn-coral px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {busy ? "Listing…" : "List it"}
            </button>
          </div>
        </>
      )}

      {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
      {posted ? <p role="status" className="text-xs text-mint">{posted}</p> : null}
    </div>
  );
}
