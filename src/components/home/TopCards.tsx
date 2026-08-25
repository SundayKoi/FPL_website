// The week's best cards, on the homepage.
//
// Replaces the Weekly Standouts spotlight. Standouts ranked players by
// powerRanking, which is no longer what a card's OVR is scored on — so the
// homepage was publishing one ladder while the card hub published another,
// and the two disagreed about who had the better week. This shows the
// cards themselves, which is the rating the league actually reads.
//
// Server-renderable: a static top five with no rotation. The old spotlight
// auto-advanced through five players, which meant four of them were hidden
// at any moment and the panel needed client state to show them.

import Link from "next/link";
import type { PlayerCardData } from "@/lib/cards/build";

/** Tier accent, matching the card's own banner colours. */
const TIER_COLORS: Record<string, string> = {
  bronze: "#b08d57",
  silver: "#c0c9d2",
  gold: "#e6c14b",
  platinum: "#4fd0bf",
  emerald: "#3fdc7f",
  diamond: "#8fd3ff",
  master: "#c78fff",
  challenger: "#ffd166",
};

function roleLabel(role: string): string {
  return role.toUpperCase() === "UTILITY" ? "SUPPORT" : role.toUpperCase();
}

export default function TopCards({
  cards,
  basePath = "/cards",
  count = 5,
}: {
  cards: PlayerCardData[];
  /** Where "all cards" points — the Academy homepage has its own hub. */
  basePath?: string;
  count?: number;
}) {
  // Already sorted best-first by the build, but the homepage should not
  // depend on a caller's ordering to be correct.
  const top = [...cards].sort((a, b) => b.overall - a.overall).slice(0, count);
  if (top.length === 0) return null;

  return (
    <section aria-labelledby="top-cards-heading" className="card-brand flex flex-col gap-4 p-5 sm:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-3">
        <div>
          <span className="label-dash">This week</span>
          <h2 id="top-cards-heading" className="font-display mt-2 text-2xl font-semibold text-white sm:text-3xl">
            Top Cards
          </h2>
        </div>
        <Link
          href={basePath}
          className="text-xs font-semibold uppercase tracking-[0.16em] text-coral underline-offset-4 hover:text-white hover:underline"
        >
          All cards →
        </Link>
      </div>

      <ol className="flex flex-col gap-2">
        {top.map((card, index) => {
          const tint = TIER_COLORS[card.tier.key] ?? "#a7c0d8";
          return (
            <li key={card.slug}>
              <Link
                href={`/card/${card.slug}`}
                className="flex items-center gap-3 rounded-xl border border-line bg-navy/60 px-3 py-2.5 transition hover:border-coral/70 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
              >
                <span className="w-5 shrink-0 text-center font-mono text-sm font-bold text-steel">{index + 1}</span>
                <span
                  className="flex h-11 w-11 shrink-0 flex-col items-center justify-center rounded-full border-2 tabular-nums"
                  style={{ borderColor: tint }}
                >
                  <span className="text-sm font-black leading-none text-white">{card.overall}</span>
                  <span className="text-[8px] uppercase tracking-[0.1em] text-steel">OVR</span>
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block truncate font-display text-base font-semibold text-white">{card.name}</span>
                  <span className="block truncate text-[11px] uppercase tracking-[0.14em] text-steel">
                    {roleLabel(card.role)}
                    {card.teamAbbr || card.teamName ? ` · ${card.teamAbbr ?? card.teamName}` : ""}
                  </span>
                </span>
                <span
                  className="hidden shrink-0 rounded-full px-2.5 py-1 text-[10px] font-black uppercase tracking-[0.14em] text-navy sm:block"
                  style={{ background: tint }}
                >
                  {card.tier.label}
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
    </section>
  );
}
