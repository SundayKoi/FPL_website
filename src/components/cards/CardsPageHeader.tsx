import type { ReactNode } from "react";

/**
 * The header every page under a cards tab wears: where you are (the tab,
 * the league, the season), what this page is called — the same name as
 * its sub-tab — and one paragraph on what it is for. One component so the
 * Browse pages read as sections of Browse and the Market pages as sections
 * of Market, rather than as nine differently-shaped destinations.
 */
export default function CardsPageHeader({
  eyebrow,
  title,
  children,
  aside,
}: {
  eyebrow: string;
  title: string;
  /** The one paragraph. Omit on a page whose body explains itself. */
  children?: ReactNode;
  /** A figure or control pinned to the right — the Gauntlet's week score. */
  aside?: ReactNode;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="label-dash">{eyebrow}</span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">{title}</h1>
        {children ? <p className="mt-3 max-w-2xl text-sm text-steel">{children}</p> : null}
      </div>
      {aside}
    </header>
  );
}

/** "Browse · Premier · Season S5" — the eyebrow's standard shape. */
export function cardsEyebrow(tab: string, league: "premier" | "academy", season: string | null): string {
  return `${tab} · ${league === "academy" ? "Academy" : "Premier"} · Season ${season ?? "—"}`;
}
