"use client";

import { useState } from "react";
import Image from "next/image";

/** Full-bleed branded popup for the moment your nomination comes up. Shows
 * once per turn (reappears if the turn comes back around) and never blocks
 * the board for anyone else. */
export default function NominationAlert({
  isMyNomination,
  round,
  minimumBid,
}: {
  isMyNomination: boolean;
  round: number;
  minimumBid: number;
}) {
  const [dismissedTurn, setDismissedTurn] = useState(false);

  // reset the dismissal when the turn moves away, so the next time the
  // nomination comes back the popup fires again (state-during-render pattern,
  // same as SiteNavigation's route-change close)
  const [prevMine, setPrevMine] = useState(isMyNomination);
  if (isMyNomination !== prevMine) {
    setPrevMine(isMyNomination);
    if (isMyNomination) setDismissedTurn(false);
  }

  if (!isMyNomination || dismissedTurn) return null;

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="nomination-alert-title"
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy/80 p-6 backdrop-blur-sm"
    >
      <div className="card-brand relative w-full max-w-md overflow-hidden p-8 text-center">
        <div
          aria-hidden="true"
          className="absolute inset-x-0 top-0 h-1 bg-gradient-to-r from-transparent via-gold to-transparent"
        />
        <Image
          src="/fpl-logo.png"
          width={64}
          height={64}
          alt=""
          className="mx-auto h-16 w-16 motion-safe:animate-bounce"
        />
        <span className="label-dash mt-4 inline-block">ON THE CLOCK</span>
        <h2 id="nomination-alert-title" className="type-display mt-2 text-3xl text-white">
          Your nomination
        </h2>
        <p className="mt-3 text-sm text-steel">
          Round {round} — opening bids start at{" "}
          <span className="font-display font-semibold not-italic text-gold">{minimumBid}</span>. Pick a
          player and put them on the block.
        </p>
        <button
          type="button"
          autoFocus
          onClick={() => setDismissedTurn(true)}
          className="btn-pill mt-6"
        >
          Pick my player
        </button>
      </div>
    </div>
  );
}
