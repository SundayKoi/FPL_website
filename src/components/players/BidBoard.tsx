"use client";

import { useState } from "react";
import { normalizePlayerName } from "@/lib/players/freeAgency";
import {
  FREE_AGENCY_BID_BOARD,
  FREE_AGENCY_BID_BOARD_HEADERS,
} from "@/lib/players/freeAgencyBidBoard";

/**
 * Free Agency bid board grid: one row per captain, one column per point
 * value. Clicking a bid highlights every cell naming the same player;
 * clicking it again clears the selection.
 */
export default function BidBoard() {
  const [selectedBidBoardPlayer, setSelectedBidBoardPlayer] = useState<string | null>(null);

  return (
    <section aria-label="Free Agency bid board" className="card-brand mt-10 overflow-x-auto p-4 sm:p-6">
      <h2 className="type-display text-2xl text-white">Bid Board</h2>
      <div className="mt-4 min-w-[1100px]">
        <div className="grid grid-cols-[minmax(12rem,1.2fr)_repeat(12,minmax(5.5rem,1fr))] gap-px bg-border-subtle text-center text-[0.6rem] font-bold uppercase tracking-[0.08em] text-muted">
          <span className="bg-canvas px-2 py-2 text-left">Captain</span>
          {FREE_AGENCY_BID_BOARD_HEADERS.map((header, index) => (
            <span key={`${header}-${index}`} className="bg-canvas px-2 py-2">{header}</span>
          ))}
          {FREE_AGENCY_BID_BOARD.flatMap((row) => [
            <span key={`${row.captain}-name`} className="bg-surface px-2 py-3 text-left font-semibold text-white">{row.captain}</span>,
            ...row.bids.map((player, index) => {
              // Voided bid (player removed from the league): keep
              // the slot as an empty cell so later bids stay in
              // their point-value columns.
              if (player === null) {
                return (
                  <span
                    key={`${row.captain}-${index}`}
                    aria-label="Voided bid"
                    className="bg-surface/60 px-2 py-3"
                  />
                );
              }
              const isHighlighted =
                selectedBidBoardPlayer !== null &&
                normalizePlayerName(player) === normalizePlayerName(selectedBidBoardPlayer);
              return (
                <button
                  key={`${row.captain}-${index}`}
                  type="button"
                  aria-pressed={isHighlighted}
                  onClick={() =>
                    setSelectedBidBoardPlayer((current) =>
                      current !== null && normalizePlayerName(current) === normalizePlayerName(player)
                        ? null
                        : player,
                    )
                  }
                  className={`bg-surface px-2 py-3 text-left transition-colors hover:bg-action-fill/20 focus-visible:z-10 focus-visible:outline focus-visible:outline-2 focus-visible:outline-focus ${
                    isHighlighted
                      ? "font-extrabold text-white [box-shadow:inset_0_0_0_2px_var(--color-focus)]"
                      : "font-medium text-muted"
                  }`}
                >
                  {player}
                </button>
              );
            }),
          ])}
        </div>
      </div>
    </section>
  );
}
