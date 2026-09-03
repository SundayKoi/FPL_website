"use client";

// The other half of the market: money looking for a card.
//
// A listing says "here is a copy, who wants it". A want says "here is money,
// who has one" — and the difference matters most for the cards that are
// genuinely hard to find, which nobody lists precisely because nobody wants to
// part with them. A standing bounty is the only way to reach the person who
// has one and had not thought about selling.
//
// Filling is a two-step click because the viewer has to choose WHICH of their
// copies answers it: "Fill" opens the matching copies they own, and picking
// one is the commit. Copies that cannot change hands are not offered — the
// action re-checks all of it anyway, but a card that fails at the last click
// is a worse experience than one that was never on the menu.

import { useMemo, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { fmtPoints } from "@/lib/betting/format";
import type { CardLeague } from "@/lib/cards/queries";
import { editionLabel } from "@/lib/packs/week";
import { cancelWant, createWant, fillWant } from "@/lib/market/actions";
import { MAX_NOTE_CHARS, MAX_WANT_BOUNTY } from "@/lib/market/config";
import type { WantStatus } from "@/lib/market/queries";
import { tierLabel } from "./CardCopyPreview";
import type { TradeCardOption } from "./TradeBuilder";

export interface BoardWant {
  id: number;
  discordId: string;
  username: string;
  slug: string;
  /** The player's name for this slug, resolved server-side; the slug itself
   *  when the season no longer prints them. */
  playerName: string;
  bounty: number;
  note: string | null;
  status: WantStatus;
  filledByUsername: string | null;
}

export interface WantablePlayerOption {
  slug: string;
  name: string;
}

/** Highest bounty first — a want board is read for the money on offer. */
export function byBounty(a: BoardWant, b: BoardWant): number {
  return b.bounty - a.bounty || a.id - b.id;
}

/** The viewer's copies that would actually satisfy this want: right player,
 *  and free to move. Season is not checked here because the page only ever
 *  hands over one season's shelf. */
export function matchingCopies(
  want: BoardWant,
  inventory: TradeCardOption[],
  unavailableIds?: ReadonlySet<number>,
): TradeCardOption[] {
  return inventory.filter((card) => card.slug === want.slug && !unavailableIds?.has(card.id));
}

function WantRow({
  want,
  mine,
  inventory,
  unavailableIds,
  onChanged,
}: {
  want: BoardWant;
  mine: boolean;
  inventory: TradeCardOption[];
  unavailableIds?: ReadonlySet<number>;
  onChanged: () => void;
}) {
  const [picking, setPicking] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [busy, startWorking] = useTransition();
  const candidates = useMemo(
    () => matchingCopies(want, inventory, unavailableIds),
    [want, inventory, unavailableIds],
  );

  function fill(inventoryId: number) {
    setError(null);
    startWorking(async () => {
      const result = await fillWant(want.id, inventoryId);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setPicking(false);
      onChanged();
    });
  }

  function drop() {
    setError(null);
    startWorking(async () => {
      const result = await cancelWant(want.id);
      if (!result.ok) {
        setError(result.error);
        return;
      }
      onChanged();
    });
  }

  return (
    <li className="flex flex-col gap-2 rounded-lg border border-line bg-panel p-3" data-testid="market-want">
      <div className="flex flex-wrap items-center gap-2 text-[11px]">
        <span className="min-w-0 flex-1 truncate text-sm font-semibold text-white">{want.playerName}</span>
        <span className="font-mono text-sm font-bold text-gold">{fmtPoints(want.bounty)}</span>
      </div>
      <div className="flex flex-wrap items-center gap-2 text-[11px] text-steel">
        <span>
          wanted by <span className="font-semibold text-white">{want.username}</span>
        </span>
        {want.note ? <span className="italic">“{want.note}”</span> : null}
        {want.status === "filled" ? (
          <span className="font-semibold uppercase tracking-wide text-mint">
            Filled{want.filledByUsername ? ` by ${want.filledByUsername}` : ""}
          </span>
        ) : null}
        {want.status === "cancelled" ? (
          <span className="font-semibold uppercase tracking-wide text-steel">Withdrawn</span>
        ) : null}

        {want.status === "open" ? (
          mine ? (
            <button
              type="button"
              onClick={drop}
              disabled={busy}
              className="ml-auto rounded-full border border-line px-3 py-1 text-xs font-semibold text-steel transition hover:border-coral hover:text-coral disabled:cursor-not-allowed disabled:opacity-50"
            >
              {busy ? "Withdrawing…" : "Withdraw"}
            </button>
          ) : (
            <button
              type="button"
              onClick={() => setPicking((open) => !open)}
              disabled={busy || candidates.length === 0}
              title={candidates.length === 0 ? "You don't have a copy of them" : undefined}
              className="btn-coral ml-auto px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
            >
              {candidates.length === 0 ? "No copy" : picking ? "Never mind" : "Fill"}
            </button>
          )
        ) : null}
      </div>

      {picking && candidates.length > 0 ? (
        <ul className="flex flex-col gap-1 border-t border-line pt-2" data-testid="fill-picker">
          {candidates.map((card) => (
            <li key={card.id} className="flex flex-wrap items-center gap-2 text-[11px]">
              <span className="min-w-0 flex-1 truncate font-semibold text-white">{card.playerName}</span>
              <span className="font-mono font-bold text-mint">{card.overall}</span>
              <span className="text-steel">{tierLabel(card.tier)}</span>
              <span className="text-steel">{editionLabel(card.editionWeek)}</span>
              {card.foil ? (
                <span className="font-black text-gold" title="Foil copy">
                  ✦
                </span>
              ) : null}
              <button
                type="button"
                onClick={() => fill(card.id)}
                disabled={busy}
                className="btn-coral ml-auto px-3 py-1 text-xs disabled:cursor-not-allowed disabled:opacity-50"
              >
                {busy ? "Selling…" : `Sell for ${fmtPoints(want.bounty)}`}
              </button>
            </li>
          ))}
        </ul>
      ) : null}

      {error ? <p role="alert" className="text-[11px] text-red-400">{error}</p> : null}
    </li>
  );
}

export default function WantsBoard({
  wants,
  players,
  myInventory,
  viewerDiscordId,
  league,
  unavailableIds,
}: {
  wants: BoardWant[];
  /** Every player this season prints — the only slugs a want may name. */
  players: WantablePlayerOption[];
  myInventory: TradeCardOption[];
  viewerDiscordId: string;
  league: CardLeague;
  /** Copies of yours that cannot change hands (deployed, or already listed). */
  unavailableIds?: ReadonlySet<number>;
}) {
  const router = useRouter();
  const [slug, setSlug] = useState("");
  const [bounty, setBounty] = useState("");
  const [note, setNote] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [posted, setPosted] = useState<string | null>(null);
  const [busy, startPosting] = useTransition();

  const rows = useMemo(() => [...wants].sort(byBounty), [wants]);

  function post() {
    setError(null);
    setPosted(null);
    if (!slug) {
      setError("Pick a player to ask for.");
      return;
    }
    const trimmed = bounty.trim();
    if (!/^\d+$/.test(trimmed) || Number(trimmed) < 1 || Number(trimmed) > MAX_WANT_BOUNTY) {
      setError(`A bounty has to be a whole number from $1 to ${fmtPoints(MAX_WANT_BOUNTY)}.`);
      return;
    }
    startPosting(async () => {
      const result = await createWant({ slug, bounty: Number(trimmed), note, league });
      if (!result.ok) {
        setError(result.error);
        return;
      }
      setSlug("");
      setBounty("");
      setNote("");
      setPosted("Posted — anyone holding one can sell it to you at that price.");
      router.refresh();
    });
  }

  return (
    <div className="flex flex-col gap-3" data-testid="wants-board">
      <div className="card-brand flex flex-wrap items-end gap-3 p-5">
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-steel">Looking for</span>
          <select
            className="input-brand w-full p-2 text-sm"
            value={slug}
            disabled={busy}
            aria-label="Player wanted"
            onChange={(event) => setSlug(event.target.value)}
          >
            <option value="">{players.length === 0 ? "No cards this season yet" : "Pick a player…"}</option>
            {players.map((player) => (
              <option key={player.slug} value={player.slug}>
                {player.name}
              </option>
            ))}
          </select>
        </label>
        <label className="flex flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-steel">Bounty</span>
          <input
            className="input-brand w-28 p-1.5 text-sm"
            inputMode="numeric"
            placeholder="800"
            value={bounty}
            disabled={busy}
            aria-label="Bounty"
            onChange={(event) => setBounty(event.target.value)}
          />
        </label>
        <label className="flex min-w-0 flex-1 flex-col gap-1">
          <span className="text-[11px] uppercase tracking-wide text-steel">Note (optional)</span>
          <input
            className="input-brand w-full p-1.5 text-sm"
            placeholder="need it for the set"
            maxLength={MAX_NOTE_CHARS}
            value={note}
            disabled={busy}
            aria-label="Want note"
            onChange={(event) => setNote(event.target.value)}
          />
        </label>
        <button
          type="button"
          onClick={post}
          disabled={busy}
          className="btn-coral px-4 py-2 text-sm disabled:cursor-not-allowed disabled:opacity-60"
        >
          {busy ? "Posting…" : "Post want"}
        </button>
      </div>

      {error ? <p role="alert" className="text-xs text-red-400">{error}</p> : null}
      {posted ? <p role="status" className="text-xs text-mint">{posted}</p> : null}

      {rows.length === 0 ? (
        <p className="text-sm text-steel">Nobody is asking for anything yet.</p>
      ) : (
        <ul className="flex flex-col gap-2">
          {rows.map((want) => (
            <WantRow
              key={want.id}
              want={want}
              mine={want.discordId === viewerDiscordId}
              inventory={myInventory}
              unavailableIds={unavailableIds}
              onChanged={() => router.refresh()}
            />
          ))}
        </ul>
      )}
    </div>
  );
}
