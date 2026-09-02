// A card on the felt: the four things the game reads (team, role, tier,
// overall) and the name, small enough that seven fit in a hand. Face down
// is a plain back — the felt never leaks a hole card through its markup.

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

export default function MiniCard({ card, faceDown = false, dim = false }: { card?: ShowdownCard | null; faceDown?: boolean; dim?: boolean }) {
  if (faceDown || !card) {
    return (
      <div
        aria-label={faceDown ? "Face-down card" : "Empty"}
        className={`flex h-[4.6rem] w-[3.4rem] items-center justify-center rounded-md border ${
          faceDown ? "border-line bg-[linear-gradient(135deg,#18232e,#0d141b)]" : "border-dashed border-line/60"
        } ${dim ? "opacity-50" : ""}`}
      >
        {faceDown ? <span className="text-[10px] font-bold tracking-[0.2em] text-steel">FPL</span> : null}
      </div>
    );
  }
  return (
    <div
      className={`flex h-[4.6rem] w-[3.4rem] flex-col justify-between rounded-md border bg-panel px-1 py-1 text-left ${
        card.foil ? "border-gold shadow-[0_0_0_1px_rgb(245_182_46_/_0.4)]" : "border-line"
      } ${dim ? "opacity-50" : ""}`}
      title={`${card.name ?? ""} · ${card.team} · ${card.role} · ${card.tier} ${card.overall}${card.foil ? " · foil" : ""}`}
    >
      <span className={`type-display text-lg leading-none ${TIER_TONE[card.tier] ?? "text-white"}`}>{card.overall}</span>
      <span className="truncate text-[9px] font-semibold leading-tight text-white">{card.name ?? card.team}</span>
      <span className="truncate text-[8px] uppercase tracking-wider text-steel">
        {card.team} · {card.role}
      </span>
    </div>
  );
}
