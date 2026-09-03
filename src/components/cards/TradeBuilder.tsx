"use client";

// Writing an offer: pick a collector, tick cards off each shelf, name the
// dollars, send.
//
// Nothing here is authoritative. The card lists, the caps, the "something on
// the table" check — all of it is a preview of a verdict `createTradeAction`
// re-derives from the session and the database, which is why the action's
// error renders inline rather than being pre-empted by a disabled button.
// The only thing this component really owns is the shape of the click.
//
// The partner's shelf comes from a server action rather than a client fetch:
// card_inventory has no public RLS policy, so there is no endpoint to fetch
// from — and a collection is meant to be seen anyway, which is the whole
// premise of asking someone for a card.
//
// Both shelves stay flat rows, but every row can be opened as the real card
// (CardCopyPreview) — you should never tick a box on a copy you haven't seen.
// Your own frozen cards arrive with the page (a collection is small); theirs
// are fetched one at a time on open, because a shelf can run to hundreds of
// copies and almost none of them get looked at.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import type { PlayerCardData } from "@/lib/cards/build";
import type { CardLeague } from "@/lib/cards/queries";
import { editionLabel } from "@/lib/packs/week";
import { createTradeAction, fetchInventoryCardAction, fetchPartnerInventoryAction } from "@/lib/trades/actions";
import type { Collector } from "@/lib/trades/queries";
import CardCopyPreview, { tierLabel } from "./CardCopyPreview";

/** An owned copy as the builder lists it — flat columns, plus the frozen card
 *  when the caller happens to hold it (your own shelf does; a partner's
 *  doesn't, and its rows are previewed on demand instead). */
export interface TradeCardOption {
  id: number;
  slug: string;
  playerName: string;
  role: string;
  overall: number;
  tier: string;
  foil: boolean;
  signed: boolean;
  /** This copy printed in an alternate skin. */
  altArt: boolean;
  editionWeek: string;
  card?: PlayerCardData | null;
}

/** Cards per side, mirroring MAX_TRADE_CARDS in src/lib/trades/actions.ts.
 *  Duplicated rather than imported because that module is "use server" —
 *  importing a constant out of it would drag the actions into the bundle. */
const MAX_CARDS = 20;

/** Best card first — the thing a trader scans for. */
function byValue(a: TradeCardOption, b: TradeCardOption): number {
  return b.overall - a.overall || a.playerName.localeCompare(b.playerName);
}

/** A "" / "0" / "150" input as dollars, or null if it isn't a whole number. */
function parseDollars(raw: string): number | null {
  const trimmed = raw.trim();
  if (trimmed === "") return 0;
  if (!/^\d+$/.test(trimmed)) return null;
  return Number(trimmed);
}

/** "(1 ✦, 1 ALT)" — which of the chosen copies are variants, or "" when none
 *  are. Counted rather than listed: the summary is a last glance before
 *  sending, and "2 cards" hides the difference between two commons and two
 *  foils. */
function variantNote(cards: TradeCardOption[]): string {
  const parts: string[] = [];
  const foils = cards.filter((card) => card.foil).length;
  const signed = cards.filter((card) => card.signed).length;
  const alts = cards.filter((card) => card.altArt).length;
  if (foils > 0) parts.push(`${foils} ✦`);
  if (signed > 0) parts.push(`${signed} ✍`);
  if (alts > 0) parts.push(`${alts} ALT`);
  return parts.length === 0 ? "" : ` (${parts.join(", ")})`;
}

/** "2 cards (1 ✦, 1 ALT) + $100" / "nothing" — one side of the summary. */
function sideLabel(cards: TradeCardOption[], dollars: number): string {
  const parts: string[] = [];
  if (cards.length > 0) parts.push(`${cards.length} card${cards.length === 1 ? "" : "s"}${variantNote(cards)}`);
  if (dollars > 0) parts.push(fmtPoints(dollars));
  return parts.length === 0 ? "nothing" : parts.join(" + ");
}

/** One shelf as a checkbox list. Compact rows on purpose — a collection runs
 *  to hundreds of copies, and the decision being made is "this one or that
 *  one" — with a view button on each row for when the answer to that is
 *  "let me see them".
 *
 *  The view button sits OUTSIDE the label: a button inside a <label> gets
 *  clicked and toggles the checkbox too, which would tick a card every time
 *  someone went to look at it. */
function CardPicker({
  cards,
  chosen,
  onToggle,
  empty,
  disabled,
  testId,
  deployedIds,
}: {
  cards: TradeCardOption[];
  chosen: Set<number>;
  onToggle: (id: number) => void;
  empty: string;
  disabled: boolean;
  testId: string;
  /** Copies away on an expedition — yours only; a partner's lock is theirs
   *  to see and this side has no read on it. Courtesy again: accept_card_
   *  trade hits card_inventory_expedition_guard and refuses the swap
   *  outright, but finding that out at ACCEPT time means the offer was
   *  written, sent, and then died in someone else's inbox. */
  deployedIds?: ReadonlySet<number>;
}) {
  if (cards.length === 0) return <p className="text-xs text-muted">{empty}</p>;
  return (
    <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1" data-testid={testId}>
      {cards.map((card) => {
        const deployed = deployedIds?.has(card.id) ?? false;
        return (
        <li key={card.id} className="flex items-stretch gap-1">
          <label
            title={deployed ? "On expedition — back soon." : undefined}
            className={`flex min-w-0 flex-1 items-center gap-2 rounded-md border border-border-subtle bg-surface px-2 py-1 text-[11px] ${
              deployed ? "cursor-not-allowed opacity-50" : "cursor-pointer hover:border-action-text/60"
            }`}
          >
            <input
              type="checkbox"
              checked={chosen.has(card.id)}
              disabled={disabled || deployed}
              onChange={() => onToggle(card.id)}
              aria-label={`${card.playerName} ${card.overall} ${editionLabel(card.editionWeek)}`}
              className="accent-coral"
            />
            <span className="min-w-0 flex-1 truncate font-semibold text-white">{card.playerName}</span>
            <span className="font-mono font-bold text-mint">{card.overall}</span>
            <span className="text-muted">{tierLabel(card.tier)}</span>
            <span className="text-muted">{editionLabel(card.editionWeek)}</span>
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
            {card.altArt ? (
              <span className="font-black tracking-[0.12em] text-gold" title="Alternate art print">
                ALT
              </span>
            ) : null}
            {deployed ? (
              <span className="shrink-0 whitespace-nowrap font-semibold uppercase tracking-wide text-muted">
                On expedition
              </span>
            ) : null}
          </label>
          <CardCopyPreview
            card={card.card ?? null}
            // Only reached for a partner's rows — your own arrive with their
            // frozen card already attached, so this never fires for them.
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
            label={`View ${card.playerName} ${card.overall} ${editionLabel(card.editionWeek)} card`}
            className="shrink-0 rounded-md border border-border-strong bg-surface px-2 text-[11px] text-muted transition hover:border-action-text hover:text-action-text focus-visible:border-action-text focus-visible:outline-none"
          >
            <span aria-hidden>⤢</span>
          </CardCopyPreview>
        </li>
        );
      })}
    </ul>
  );
}

export default function TradeBuilder({
  collectors,
  myInventory,
  viewerDiscordId,
  league,
  deployedIds,
  initialGive = null,
}: {
  collectors: Collector[];
  myInventory: TradeCardOption[];
  viewerDiscordId: string;
  league: CardLeague;
  /** Your copies currently out on an expedition — unofferable until they
   *  are back. Only your side: the partner's shelf arrives from a server
   *  action that reads their inventory, not their runs. */
  deployedIds?: ReadonlySet<number>;
  /** A copy to start the offer with — the shelf's "Trade" action lands
   *  here with ?offer=<id>. A hint: ignored unless it is yours and home. */
  initialGive?: number | null;
}) {
  const router = useRouter();
  const [partner, setPartner] = useState("");
  const [partnerCards, setPartnerCards] = useState<TradeCardOption[] | null>(null);
  const [give, setGive] = useState<Set<number>>(
    () =>
      new Set(
        initialGive !== null && myInventory.some((card) => card.id === initialGive) && !deployedIds?.has(initialGive)
          ? [initialGive]
          : [],
      ),
  );
  const [get, setGet] = useState<Set<number>>(new Set());
  const [giveDollars, setGiveDollars] = useState("");
  const [getDollars, setGetDollars] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState<string | null>(null);
  const [loading, startLoading] = useTransition();
  const [sending, startSending] = useTransition();

  const partners = useMemo(
    () => collectors.filter((collector) => collector.discordId !== viewerDiscordId),
    [collectors, viewerDiscordId],
  );
  const mine = useMemo(() => [...myInventory].sort(byValue), [myInventory]);
  const theirs = useMemo(() => (partnerCards ? [...partnerCards].sort(byValue) : []), [partnerCards]);
  // The chosen copies themselves, not just how many — the summary counts
  // foils, signatures and alternate prints out of them.
  const giving = useMemo(() => mine.filter((card) => give.has(card.id)), [mine, give]);
  const getting = useMemo(() => theirs.filter((card) => get.has(card.id)), [theirs, get]);

  const offeredDollars = parseDollars(giveDollars);
  const requestedDollars = parseDollars(getDollars);
  const busy = loading || sending;

  function reset() {
    setGive(new Set());
    setGet(new Set());
    setGiveDollars("");
    setGetDollars("");
  }

  function choosePartner(discordId: string) {
    setPartner(discordId);
    setPartnerCards(null);
    setError(null);
    setSent(null);
    reset();
    if (!discordId) return;
    startLoading(async () => {
      const result = await fetchPartnerInventoryAction(discordId, league);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPartnerCards(result.cards);
    });
  }

  /** Set-in-state, replaced rather than mutated so React sees the change. */
  function toggle(setter: typeof setGive, id: number) {
    setSent(null);
    setter((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function send() {
    setError(null);
    setSent(null);
    if (offeredDollars === null || requestedDollars === null) {
      setError("Trade dollars have to be a whole number.");
      return;
    }
    if (give.size > MAX_CARDS || get.size > MAX_CARDS) {
      setError(`Trades are capped at ${MAX_CARDS} cards a side.`);
      return;
    }
    if (give.size + get.size === 0 && offeredDollars + requestedDollars === 0) {
      setError("An empty trade isn't a trade — add a card or some dollars.");
      return;
    }
    startSending(async () => {
      const result = await createTradeAction({
        toDiscordId: partner,
        offeredIds: [...give],
        requestedIds: [...get],
        offeredDollars,
        requestedDollars,
      });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      reset();
      setSent("Offer sent — it's under Your offers until they answer.");
      router.refresh();
    });
  }

  return (
    <div className="card-brand flex flex-col gap-4 p-5" data-testid="trade-builder">
      <label className="flex flex-wrap items-center gap-3">
        <span className="text-xs font-semibold uppercase tracking-wide text-muted">Trade with</span>
        <select
          className="input-brand min-w-0 flex-1 p-2 text-sm"
          value={partner}
          disabled={busy}
          onChange={(event) => choosePartner(event.target.value)}
        >
          <option value="">{partners.length === 0 ? "Nobody else is collecting yet" : "Pick a collector…"}</option>
          {partners.map((collector) => (
            <option key={collector.discordId} value={collector.discordId}>
              {collector.username} — {collector.cards} card{collector.cards === 1 ? "" : "s"}
            </option>
          ))}
        </select>
      </label>

      {partner === "" ? (
        <p className="text-sm text-muted">Pick someone to see what they have.</p>
      ) : (
        <>
          <div className="grid gap-4 sm:grid-cols-2">
            <div className="flex flex-col gap-2">
              <span className="label-dash">You give</span>
              <CardPicker
                cards={mine}
                chosen={give}
                onToggle={(id) => toggle(setGive, id)}
                empty="You don't own any cards yet — open a pack."
                disabled={busy}
                testId="give-picker"
                deployedIds={deployedIds}
              />
              <label className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted">Your dollars</span>
                <input
                  className="input-brand w-28 p-1.5 text-sm"
                  inputMode="numeric"
                  placeholder="0"
                  value={giveDollars}
                  disabled={busy}
                  aria-label="Dollars you give"
                  onChange={(event) => setGiveDollars(event.target.value)}
                />
              </label>
            </div>

            <div className="flex flex-col gap-2">
              <span className="label-dash">You get</span>
              {loading ? (
                <p className="text-xs text-muted">Loading their collection…</p>
              ) : (
                <CardPicker
                  cards={theirs}
                  chosen={get}
                  onToggle={(id) => toggle(setGet, id)}
                  empty="They don't have any cards this season."
                  disabled={busy}
                  testId="get-picker"
                />
              )}
              <label className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-muted">Their dollars</span>
                <input
                  className="input-brand w-28 p-1.5 text-sm"
                  inputMode="numeric"
                  placeholder="0"
                  value={getDollars}
                  disabled={busy}
                  aria-label="Dollars you get"
                  onChange={(event) => setGetDollars(event.target.value)}
                />
              </label>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-3 border-t border-border-subtle pt-3">
            <span className="text-sm text-white" data-testid="trade-summary">
              {sideLabel(giving, offeredDollars ?? 0)} ⇄ {sideLabel(getting, requestedDollars ?? 0)}
            </span>
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="btn-primary ml-auto px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send offer"}
            </button>
          </div>
        </>
      )}

      {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
      {sent ? <p role="status" className="text-xs text-mint">{sent}</p> : null}
    </div>
  );
}
