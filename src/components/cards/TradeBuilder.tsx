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

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import type { CardLeague } from "@/lib/cards/queries";
import { editionLabel } from "@/lib/packs/week";
import { createTradeAction, fetchPartnerInventoryAction } from "@/lib/trades/actions";
import type { Collector } from "@/lib/trades/queries";

/** An owned copy as the builder lists it — flat columns only, no card json. */
export interface TradeCardOption {
  id: number;
  slug: string;
  playerName: string;
  role: string;
  overall: number;
  tier: string;
  foil: boolean;
  signed: boolean;
  editionWeek: string;
}

/** Cards per side, mirroring MAX_TRADE_CARDS in src/lib/trades/actions.ts.
 *  Duplicated rather than imported because that module is "use server" —
 *  importing a constant out of it would drag the actions into the bundle. */
const MAX_CARDS = 20;

/** "challenger" → "Challenger", same as DustControls: the tier labels in
 *  src/lib/cards/build.ts are just the capitalized key. */
function tierLabel(tier: string): string {
  return tier ? tier.charAt(0).toUpperCase() + tier.slice(1) : "—";
}

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

/** "2 cards + $100" / "nothing" — one side of the summary line. */
function sideLabel(cards: number, dollars: number): string {
  const parts: string[] = [];
  if (cards > 0) parts.push(`${cards} card${cards === 1 ? "" : "s"}`);
  if (dollars > 0) parts.push(fmtPoints(dollars));
  return parts.length === 0 ? "nothing" : parts.join(" + ");
}

/** One shelf as a checkbox list. Compact rows on purpose — a collection runs
 *  to hundreds of copies, and the decision being made is "this one or that
 *  one", not "look at this card". */
function CardPicker({
  cards,
  chosen,
  onToggle,
  empty,
  disabled,
  testId,
}: {
  cards: TradeCardOption[];
  chosen: Set<number>;
  onToggle: (id: number) => void;
  empty: string;
  disabled: boolean;
  testId: string;
}) {
  if (cards.length === 0) return <p className="text-xs text-steel">{empty}</p>;
  return (
    <ul className="flex max-h-72 flex-col gap-1 overflow-y-auto pr-1" data-testid={testId}>
      {cards.map((card) => (
        <li key={card.id}>
          <label className="flex cursor-pointer items-center gap-2 rounded-md border border-line bg-panel px-2 py-1 text-[11px] hover:border-coral/60">
            <input
              type="checkbox"
              checked={chosen.has(card.id)}
              disabled={disabled}
              onChange={() => onToggle(card.id)}
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
          </label>
        </li>
      ))}
    </ul>
  );
}

export default function TradeBuilder({
  collectors,
  myInventory,
  viewerDiscordId,
  league,
}: {
  collectors: Collector[];
  myInventory: TradeCardOption[];
  viewerDiscordId: string;
  league: CardLeague;
}) {
  const router = useRouter();
  const [partner, setPartner] = useState("");
  const [partnerCards, setPartnerCards] = useState<TradeCardOption[] | null>(null);
  const [give, setGive] = useState<Set<number>>(new Set());
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
        <span className="text-xs font-semibold uppercase tracking-wide text-steel">Trade with</span>
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
        <p className="text-sm text-steel">Pick someone to see what they have.</p>
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
              />
              <label className="flex items-center gap-2">
                <span className="text-[11px] uppercase tracking-wide text-steel">Your dollars</span>
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
                <p className="text-xs text-steel">Loading their collection…</p>
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
                <span className="text-[11px] uppercase tracking-wide text-steel">Their dollars</span>
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

          <div className="flex flex-wrap items-center gap-3 border-t border-line pt-3">
            <span className="text-sm text-white" data-testid="trade-summary">
              {sideLabel(give.size, offeredDollars ?? 0)} ⇄ {sideLabel(get.size, requestedDollars ?? 0)}
            </span>
            <button
              type="button"
              onClick={send}
              disabled={busy}
              className="btn-coral ml-auto px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
            >
              {sending ? "Sending…" : "Send offer"}
            </button>
          </div>
        </>
      )}

      {error ? <p className="text-xs text-red-400">{error}</p> : null}
      {sent ? <p className="text-xs text-mint">{sent}</p> : null}
    </div>
  );
}
