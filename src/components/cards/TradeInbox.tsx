"use client";

// The trade log: offers waiting on you, and offers you're waiting on.
//
// Both directions render from the same row component because a trade is one
// object seen from two sides — only the buttons differ (you answer theirs,
// you cancel yours). Everything else, down to the arrow between the two card
// lists, reads the same way whichever end you're standing at.
//
// Cards arrive flattened by the page, frozen `card` json included: a chip
// can say "foil" but it cannot show you the holograph, the skin it printed
// in, or the ink across the front — and those are exactly what a copy is
// worth trading for. So every chip is a trigger that opens the real card
// (CardCopyPreview). The json is affordable here because a trade names at
// most ~40 copies; a whole collection is a different bet, which is why
// TradeBuilder fetches its partner's cards one at a time instead.
//
// Staleness is server-computed (src/lib/trades/queries.ts) and only ever set
// on pending trades — a card in the offer has been dusted or traded on since
// it was written, so `accept_card_trade` would raise. Accept is disabled
// rather than hidden, so the row explains itself instead of quietly losing
// its button.

import { useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useToast } from "@/components/system/Toast";
import { easternStamp, relativeTime } from "@/lib/time";
import { useAutoDisarm } from "@/lib/ui/useAutoDisarm";
import { fmtPoints } from "@/lib/betting/format";
import type { PlayerCardData } from "@/lib/cards/build";
import { editionLabel } from "@/lib/packs/week";
import { respondTradeAction } from "@/lib/trades/actions";
import type { TradeStatus } from "@/lib/trades/queries";
import CardCopyPreview from "./CardCopyPreview";
import { provenanceLinesFor } from "./provenanceLines";

/** One card named by a trade, flattened for the client boundary. */
export interface InboxCard {
  id: number;
  playerName: string;
  overall: number;
  tier: string;
  editionWeek: string;
  foil: boolean;
  signed: boolean;
  /** This copy printed in an alternate skin. */
  altArt: boolean;
  /** The copy exactly as it was pulled — what the preview renders. Null once
   *  the row is gone, which is also when the chip stops being clickable. */
  card: PlayerCardData | null;
  /** This copy isn't where the offer says it is any more. */
  stale: boolean;
}

/** One trade, flattened for the client boundary. */
export interface InboxTrade {
  id: number;
  fromDiscordId: string;
  fromUsername: string;
  toDiscordId: string;
  toUsername: string;
  offered: InboxCard[];
  requested: InboxCard[];
  offeredDollars: number;
  requestedDollars: number;
  status: TradeStatus;
  /** Any card in this pending trade has moved — it can't be accepted. */
  stale: boolean;
  /** When it was sent — an offer from three weeks ago reads differently
   *  from one sent this morning. */
  createdAt?: string;
}

const STATUS_CHIP: Record<TradeStatus, string> = {
  pending: "border-gold/50 bg-gold/10 text-gold",
  accepted: "border-mint/50 bg-mint/10 text-mint",
  declined: "border-border-subtle bg-surface text-muted",
  cancelled: "border-border-subtle bg-surface text-muted",
};

/** "Canny 77 · WK Aug 17 ✦ ALT" — a card as one line of a trade, and the way
 *  in to the card itself. A copy with no frozen json behind it can't be
 *  rendered and has nothing to show anyway, so it stays a dead chip. */
function CardChip({ card }: { card: InboxCard }) {
  if (card.stale || !card.card) {
    return (
      <span className="rounded-full border border-border-subtle bg-surface px-2 py-0.5 text-[11px] text-muted">
        <s>{card.playerName}</s> <span className="text-red-400">no longer available</span>
      </span>
    );
  }
  const edition = card.editionWeek ? ` ${editionLabel(card.editionWeek)}` : "";
  return (
    <CardCopyPreview
      card={card.card}
      foil={card.foil}
      // Who has held this copy is exactly the thing you want before
      // agreeing to take it — and the one question the chip beside it
      // cannot answer.
      loadProvenance={() => provenanceLinesFor(card.id)}
      caption={{
        playerName: card.playerName,
        editionWeek: card.editionWeek,
        tier: card.tier,
        foil: card.foil,
        signed: card.signed,
        altArt: card.altArt,
      }}
      label={`View ${card.playerName} ${card.overall}${edition} card`}
      className="rounded-full border border-border-strong bg-surface px-2 py-0.5 text-[11px] text-white transition hover:border-action-text/70 hover:text-action-text focus-visible:border-action-text focus-visible:outline-none"
    >
      {card.playerName} <b className="font-mono text-muted">{card.overall}</b>
      {card.editionWeek ? <span className="text-muted"> · {editionLabel(card.editionWeek)}</span> : null}
      {card.signed ? <span className="font-black text-gold" title="Autographed copy"> ✍</span> : null}
      {card.foil ? <span className="font-black text-gold" title="Foil copy"> ✦</span> : null}
      {card.altArt ? (
        <span className="ml-1 font-black tracking-[0.12em] text-gold" title="Alternate art print">
          ALT
        </span>
      ) : null}
      <span aria-hidden className="ml-1 text-muted">
        ⤢
      </span>
    </CardCopyPreview>
  );
}

/** One half of a trade: the cards, then the money. Both can be empty — a
 *  pure-dollars offer is legal, and so is a one-way gift. */
function TradeSide({ label, cards, dollars }: { label: string; cards: InboxCard[]; dollars: number }) {
  return (
    <div className="flex min-w-0 flex-1 flex-col gap-1.5">
      <span className="label-dash">{label}</span>
      {cards.length === 0 && dollars === 0 ? (
        <span className="text-xs text-muted">Nothing</span>
      ) : (
        <div className="flex flex-wrap items-center gap-1.5">
          {cards.map((card) => (
            <CardChip key={card.id} card={card} />
          ))}
          {dollars > 0 ? (
            <span className="rounded-full border border-gold/40 bg-gold/10 px-2 py-0.5 text-[11px] font-semibold text-gold">
              {fmtPoints(dollars)}
            </span>
          ) : null}
        </div>
      )}
    </div>
  );
}

function TradeCard({ trade, viewerDiscordId }: { trade: InboxTrade; viewerDiscordId: string }) {
  const router = useRouter();
  const { notify } = useToast();
  const [error, setError] = useState<string | null>(null);
  const [armed, setArmed] = useState(false);
  // Decline and Cancel arm on their own: they end the offer for both sides
  // with no undo, which is exactly what Accept's second click guards.
  const [armedEnd, setArmedEnd] = useState(false);
  const [pending, startTransition] = useTransition();
  useAutoDisarm(armed, () => setArmed(false));
  useAutoDisarm(armedEnd, () => setArmedEnd(false));

  // Which end of the trade the viewer is standing at, read off the trade
  // itself rather than off which list it came in — the recipient answers,
  // the sender cancels, and that is the only thing the buttons need to know.
  const incoming = trade.toDiscordId === viewerDiscordId;

  // On an incoming trade the viewer is the recipient, so the dollars leaving
  // their wallet are the ones the sender *requested*. Money out gets the same
  // second click dusting does — there is no undo on an accepted trade.
  const dollarsOut = incoming ? trade.requestedDollars : trade.offeredDollars;

  function respond(accept: boolean) {
    setError(null);
    if (accept && dollarsOut > 0 && !armed) {
      setArmed(true);
      setArmedEnd(false);
      return;
    }
    if (!accept && !armedEnd) {
      setArmedEnd(true);
      setArmed(false);
      return;
    }
    setArmed(false);
    setArmedEnd(false);
    startTransition(async () => {
      const result = await respondTradeAction(trade.id, accept);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      notify(
        accept
          ? `Trade with ${trade.fromUsername} done — the cards have swapped shelves.`
          : incoming
            ? `Declined ${trade.fromUsername}'s offer.`
            : `Offer to ${trade.toUsername} withdrawn — your cards are free again.`,
        { tone: accept ? "success" : "info" },
      );
      router.refresh();
    });
  }

  const isPending = trade.status === "pending";

  return (
    <li className="card-brand flex flex-col gap-3 p-4">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-sm font-semibold text-white">
          {trade.fromUsername} <span className="text-muted">→</span> {trade.toUsername}
        </span>
        <span
          className={`rounded-full border px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide ${STATUS_CHIP[trade.status]}`}
        >
          {trade.status}
        </span>
        {trade.createdAt ? (
          <span className="text-[11px] text-muted" title={easternStamp(trade.createdAt)}>
            {incoming ? "offered" : "sent"} {relativeTime(trade.createdAt)}
          </span>
        ) : null}
        {isPending && trade.stale ? (
          <span className="text-[11px] text-red-400">A card in this trade has moved — it can no longer be accepted.</span>
        ) : null}
      </div>

      <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:gap-4">
        <TradeSide
          label={incoming ? "They give" : "You give"}
          cards={trade.offered}
          dollars={trade.offeredDollars}
        />
        <span className="shrink-0 self-center text-lg text-muted" aria-hidden>
          ⇄
        </span>
        <TradeSide
          label={incoming ? "You give" : "They give"}
          cards={trade.requested}
          dollars={trade.requestedDollars}
        />
      </div>

      {isPending ? (
        <div className="flex flex-wrap items-center gap-2 border-t border-border-subtle pt-3">
          {incoming ? (
            <>
              <button
                type="button"
                onClick={() => respond(true)}
                disabled={pending || trade.stale}
                className="btn-primary px-4 py-1.5 text-xs disabled:cursor-not-allowed disabled:opacity-60"
              >
                {armed ? `Confirm — ${fmtPoints(dollarsOut)} leaves your wallet?` : "Accept"}
              </button>
              <button
                type="button"
                onClick={() => respond(false)}
                disabled={pending}
                className="rounded-full border border-border-strong px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:cursor-not-allowed disabled:opacity-60"
              >
                {armedEnd ? "Confirm decline" : "Decline"}
              </button>
            </>
          ) : (
            <button
              type="button"
              onClick={() => respond(false)}
              disabled={pending}
              className="rounded-full border border-border-strong px-4 py-1.5 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text disabled:cursor-not-allowed disabled:opacity-60"
            >
              {armedEnd ? "Confirm — withdraw it" : "Cancel offer"}
            </button>
          )}
        </div>
      ) : null}

      {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
    </li>
  );
}

export default function TradeInbox({
  incoming,
  outgoing,
  viewerDiscordId,
}: {
  incoming: InboxTrade[];
  outgoing: InboxTrade[];
  /** Who is looking — decides which side of each trade gets the buttons. */
  viewerDiscordId: string;
}) {
  return (
    <>
      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Incoming offers</h2>
        {incoming.length === 0 ? (
          <p className="text-sm text-muted">
            Nobody has offered you a trade yet.{" "}
            <a href="#new-trade" className="font-semibold text-coral underline-offset-4 hover:underline">
              Start one ↓
            </a>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {incoming.map((trade) => (
              <TradeCard key={trade.id} trade={trade} viewerDiscordId={viewerDiscordId} />
            ))}
          </ul>
        )}
      </section>

      <section className="flex flex-col gap-3">
        <h2 className="type-display text-2xl sm:text-3xl">Your offers</h2>
        {outgoing.length === 0 ? (
          <p className="text-sm text-muted">
            You haven&apos;t sent any offers yet.{" "}
            <a href="#new-trade" className="font-semibold text-coral underline-offset-4 hover:underline">
              Build one ↓
            </a>
          </p>
        ) : (
          <ul className="flex flex-col gap-3">
            {outgoing.map((trade) => (
              <TradeCard key={trade.id} trade={trade} viewerDiscordId={viewerDiscordId} />
            ))}
          </ul>
        )}
      </section>
    </>
  );
}
