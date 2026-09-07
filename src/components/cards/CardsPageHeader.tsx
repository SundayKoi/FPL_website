import Link from "next/link";
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
  glossary = false,
}: {
  eyebrow: string;
  title: string;
  /** The one paragraph. Omit on a page whose body explains itself. */
  children?: ReactNode;
  /** A figure or control pinned to the right — the Gauntlet's week score. */
  aside?: ReactNode;
  /** Show the glossary link under the paragraph. The tabs where the
   *  words start mattering (Collection, Market, Play) turn it on; the
   *  rarities page IS the glossary for its own words and does not. */
  glossary?: boolean;
}) {
  return (
    <header className="flex flex-wrap items-end justify-between gap-4">
      <div>
        <span className="label-dash">{eyebrow}</span>
        <h1 className="type-display mt-2 text-4xl sm:text-5xl">{title}</h1>
        {children ? <p className="mt-3 max-w-2xl text-sm text-steel">{children}</p> : null}
        {glossary ? <GlossaryLink /> : null}
      </div>
      {aside}
    </header>
  );
}

/** "Shine, dust, relic, binder — the words, explained →". One line, so a
 *  page can offer the glossary without a paragraph about it. */
export function GlossaryLink({ className = "mt-2" }: { className?: string }) {
  return (
    <Link href="/glossary" className={`inline-block text-xs text-muted underline-offset-4 hover:text-coral hover:underline ${className}`}>
      Shine, dust, relic, binder — the words, explained →
    </Link>
  );
}

/** "Browse · Premier · Season S5" — the eyebrow's standard shape. */
export function cardsEyebrow(tab: string, league: "premier" | "academy", season: string | null): string {
  return `${tab} · ${league === "academy" ? "Academy" : "Premier"} · Season ${season ?? "—"}`;
}
