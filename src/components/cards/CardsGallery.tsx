"use client";

// Premium hub grid: every rated player's card, searchable, best first.
// Cards are fully interactive in the grid; the chip under each one links to
// its own page — which is where the card is shared from AND where its owner
// restyles it, so the chip says both jobs out loud.

import Link from "next/link";
import { useState } from "react";
import type { PlayerCardData } from "@/lib/cards/build";
import PlayerCard3D from "./PlayerCard3D";

const ROLE_FILTERS = ["Top", "Jungle", "Mid", "Bot", "Support"] as const;

export default function CardsGallery({ cards }: { cards: PlayerCardData[] }) {
  const [query, setQuery] = useState("");
  const [role, setRole] = useState<string | null>(null);

  const q = query.trim().toLowerCase();
  const shown = cards.filter(
    (card) =>
      (!q || card.name.toLowerCase().includes(q) || (card.teamName ?? "").toLowerCase().includes(q)) &&
      (!role || card.role === role),
  );
  // One Card of the Week per role, in on-Rift order.
  const roleOrder = ["Top", "Jungle", "Mid", "Bot", "Support"];
  const standouts = cards
    .filter((card) => card.standout)
    .sort((a, b) => roleOrder.indexOf(a.role) - roleOrder.indexOf(b.role));

  return (
    <div className="flex flex-col gap-6">
      {standouts.length > 0 ? (
        <div className="flex flex-col items-center gap-4 rounded-2xl border border-gold/40 bg-gold/5 p-6">
          <span className="label-dash">Cards of the Week</span>
          {/* card-cell carries its own padding, so the gaps come down by that
              much to leave the strip spaced exactly as before. */}
          <div className="flex flex-wrap justify-center gap-x-0 gap-y-2">
            {standouts.map((card) => (
              <div key={card.slug} className="card-cell flex flex-col items-center gap-2">
                <PlayerCard3D card={card} />
                <Link
                  href={`/card/${card.slug}`}
                  className="rounded-full border border-border-strong bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text"
                >
                  View &amp; customize →
                </Link>
              </div>
            ))}
          </div>
        </div>
      ) : null}
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-muted sm:max-w-xs">
          Search players or teams
          <input value={query} onChange={(e) => setQuery(e.target.value)} className="input-brand px-3 py-2 text-sm" />
        </label>
        <div className="flex flex-wrap items-center gap-1.5" role="group" aria-label="Role filter">
          {ROLE_FILTERS.map((r) => (
            <button
              key={r}
              type="button"
              aria-pressed={role === r}
              onClick={() => setRole((current) => (current === r ? null : r))}
              className={`rounded-full px-2.5 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                role === r ? "bg-coral text-canvas" : "border border-border-subtle bg-surface text-muted hover:text-white"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="text-xs text-muted">
          {shown.length} of {cards.length} cards
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-muted">No cards match — stats appear after a player&apos;s first ingested game.</p>
      ) : (
        /* card-cell lets the browser skip painting the cards scrolled offscreen —
           this grid is the reason the optimisation exists. Its padding only adds
           to the row height (cells are centred in their tracks), so the row gap
           drops by that much to keep the rhythm. */
        <div className="grid justify-items-center gap-x-4 gap-y-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((card) => (
            <div key={card.slug} className="card-cell flex flex-col items-center gap-2">
              <PlayerCard3D card={card} />
              <Link
                href={`/card/${card.slug}`}
                className="rounded-full border border-border-strong bg-surface px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-action-text"
              >
                View &amp; customize →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
