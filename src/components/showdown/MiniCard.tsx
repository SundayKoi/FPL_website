// A card on the felt. The art is the same PNG the share images use, and
// under it the four things the game reads — overall, name, team, role —
// printed large enough to read on a phone, because a thumbnail of a card
// is not a card anyone can play. Face down is a plain back: the felt
// never leaks a hole card through its markup.

import type { ShowdownCard } from "@/lib/showdown/hands";

const TIER_TONE: Record<string, string> = {
  bronze: "text-[#c98a5a]",
  silver: "text-[#c9d1d9]",
  gold: "text-gold",
  platinum: "text-[#7fe0d6]",
  emerald: "text-mint",
  diamond: "text-cyan",
  master: "text-purple",
  challenger: "text-coral",
};

export type FeltCardSize = "board" | "hole" | "seat";

/** Widths per size; the art keeps the card's 5:7 shape above the strip. */
const WIDTH: Record<FeltCardSize, string> = {
  board: "w-[3.9rem] sm:w-24",
  hole: "w-[4.6rem] sm:w-28",
  seat: "w-10 sm:w-12",
};

export default function MiniCard({
  card,
  faceDown = false,
  dim = false,
  size = "board",
  label,
}: {
  card?: ShowdownCard | null;
  faceDown?: boolean;
  dim?: boolean;
  size?: FeltCardSize;
  /** A caption under the slot — "Flop", "Turn", "River". */
  label?: string;
}) {
  const width = WIDTH[size];
  const tone = card ? (TIER_TONE[card.tier] ?? "text-white") : "text-white";

  if (faceDown || !card) {
    return (
      <div className={`flex flex-col items-center gap-1 ${width} ${dim ? "opacity-50" : ""}`}>
        <div
          aria-label={faceDown ? "Face-down card" : "Empty"}
          className={`aspect-[5/7] w-full rounded-md border ${
            faceDown ? "border-line bg-[linear-gradient(135deg,#18232e,#0d141b)]" : "border-dashed border-[#e9f5ee]/30"
          } flex items-center justify-center`}
        >
          {faceDown ? <span className="text-[10px] font-bold tracking-[0.2em] text-steel">FPL</span> : null}
        </div>
        {label ? <span className="text-[10px] uppercase tracking-wider text-[#e9f5ee]/60">{label}</span> : null}
      </div>
    );
  }

  const title = `${card.name ?? ""} · ${card.team} · ${card.role} · ${card.tier} ${card.overall}${card.foil ? " · foil" : ""}`;
  const small = size === "seat";
  return (
    <div className={`flex flex-col items-center gap-1 ${width} ${dim ? "opacity-50" : ""}`} title={title}>
      <div
        className={`aspect-[5/7] w-full overflow-hidden rounded-md border bg-panel ${
          card.foil ? "border-gold shadow-[0_0_0_1px_rgb(245_182_46_/_0.5)]" : "border-line"
        }`}
      >
        {card.art ? (
          // eslint-disable-next-line @next/next/no-img-element -- a rendered PNG from our own route, no remote host to configure
          <img src={card.art} alt="" className="h-full w-full object-cover object-top" loading="lazy" />
        ) : (
          <div className="flex h-full w-full items-center justify-center">
            <span className={`type-display text-2xl ${tone}`}>{card.overall}</span>
          </div>
        )}
      </div>
      {small ? (
        <span className={`type-display text-xs leading-none ${tone}`}>{card.overall}</span>
      ) : (
        <div className="flex w-full flex-col items-center rounded-md bg-black/60 px-1 py-1 text-center leading-tight">
          <span className={`type-display text-lg sm:text-2xl ${tone}`}>{card.overall}</span>
          <span className="line-clamp-2 w-full break-words text-[10px] font-semibold leading-tight text-white sm:text-xs">
            {card.name ?? card.team}
          </span>
          <span className="line-clamp-2 w-full break-words text-[8px] uppercase leading-tight tracking-wider text-steel sm:text-[10px]">
            {card.team} · {card.role}
          </span>
        </div>
      )}
      {label ? <span className="text-[10px] uppercase tracking-wider text-[#e9f5ee]/60">{label}</span> : null}
    </div>
  );
}
