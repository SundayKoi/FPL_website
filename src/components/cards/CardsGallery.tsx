"use client";

// Premium hub grid: every rated player's card, searchable, best first.
// Cards are fully interactive in the grid; the share chip under each one
// deep-links to its public page.

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

  return (
    <div className="flex flex-col gap-6">
      <div className="flex flex-wrap items-end gap-3">
        <label className="flex min-w-48 flex-1 flex-col gap-1 text-xs text-steel sm:max-w-xs">
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
                role === r ? "bg-coral text-navy" : "border border-line bg-panel text-steel hover:text-white"
              }`}
            >
              {r}
            </button>
          ))}
        </div>
        <span className="text-xs text-steel">
          {shown.length} of {cards.length} cards
        </span>
      </div>

      {shown.length === 0 ? (
        <p className="text-sm text-steel">No cards match — stats appear after a player&apos;s first ingested game.</p>
      ) : (
        <div className="grid justify-items-center gap-x-4 gap-y-8 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {shown.map((card) => (
            <div key={card.slug} className="flex flex-col items-center gap-2">
              <PlayerCard3D card={card} />
              <Link
                href={`/card/${card.slug}`}
                className="rounded-full border border-line bg-panel px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-steel transition hover:border-coral hover:text-coral"
              >
                Share page →
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
