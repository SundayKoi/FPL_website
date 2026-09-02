"use client";

// "Which one of these is me?" — the search box on the hub's banner for a
// signed-in member who hasn't claimed a card yet.
//
// Claiming used to be reachable only by knowing that a card's page has a
// claim button on it, two clicks below a chip that said "Share page". This
// is the shortcut: type your name, click your row, land on your card with
// the claim control already ringed (?claim=1).
//
// It searches the list the hub already fetched — a slim projection of it,
// since the full cards are shipped to the gallery beside it and there is no
// reason to pay for the payload twice. No queries of its own.

import Link from "next/link";
import { useState } from "react";
import type { ClaimFinderCard } from "@/lib/cards/claimFinder";

const MAX_RESULTS = 6;

export default function ClaimFinder({ cards }: { cards: ClaimFinderCard[] }) {
  const [query, setQuery] = useState("");

  const q = query.trim().toLowerCase();
  // Nothing typed, nothing listed: an unprompted list of six arbitrary
  // players is noise on a banner, and the point is to find yourself.
  const shown = q ? cards.filter((card) => card.name.toLowerCase().includes(q)).slice(0, MAX_RESULTS) : [];

  return (
    <div className="flex w-full flex-col gap-2 sm:max-w-sm">
      <label className="flex flex-col gap-1 text-xs text-muted">
        Find your card
        <input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Your summoner name"
          className="input-brand px-3 py-2 text-sm"
        />
      </label>
      {q && shown.length === 0 ? (
        <p className="text-xs text-muted">No player matches that — cards exist once you&apos;ve played a game.</p>
      ) : null}
      {shown.length > 0 ? (
        <ul className="flex flex-col gap-1">
          {shown.map((card) => (
            <li key={card.slug}>
              <Link
                href={`/card/${card.slug}?claim=1`}
                className="flex items-center justify-between gap-2 rounded-md border border-border bg-surface px-2.5 py-1.5 text-xs text-white transition hover:border-primary hover:text-primary"
              >
                <span className="truncate font-semibold">{card.name}</span>
                <span className="shrink-0 text-[10px] uppercase tracking-wide text-muted">
                  {card.role}
                  {card.teamName ? ` · ${card.teamName}` : ""}
                </span>
              </Link>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}
