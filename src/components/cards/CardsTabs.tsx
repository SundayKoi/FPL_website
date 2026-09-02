"use client";

// The tab bar on every cards page.
//
// Two rows: the six tabs, and — when the tab you are on has pages under it
// — those pages. It replaces the hub's thirteen-link menu and the "← Back
// to player cards" link that was the only way off every sub-page. The
// league chips live here too, and nowhere else on a cards page: two
// switchers doing one job was one of the things people found confusing.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CardLeague } from "@/lib/cards/queries";
import { activeCardsSection, cardsSections, pairedCardsHref } from "@/lib/cards/sections";

const BASES: Record<CardLeague, string> = { premier: "/cards", academy: "/academy/cards" };
const LEAGUE_LABELS: Record<CardLeague, string> = { premier: "Premier", academy: "Academy" };

export default function CardsTabs({ league }: { league: CardLeague }) {
  const pathname = usePathname() ?? BASES[league];
  const base = BASES[league];
  const sections = cardsSections(base);
  const { section: active, child: activeChild } = activeCardsSection(sections, pathname);

  return (
    <nav aria-label="Cards" className="border-b border-line bg-panel/60">
      <div className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-1 gap-y-2 px-4 py-2 sm:px-6">
        <ul className="flex flex-wrap items-center gap-1">
          {sections.map((section) => {
            const current = active?.key === section.key;
            return (
              <li key={section.key}>
                <Link
                  href={section.href}
                  aria-current={current ? "page" : undefined}
                  title={section.blurb}
                  className={`inline-block rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral sm:text-sm ${
                    current ? "bg-coral text-navy" : "text-steel hover:bg-line/40 hover:text-white"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
        <div className="ml-auto flex items-center gap-1.5" role="group" aria-label="League">
          {(Object.keys(BASES) as CardLeague[]).map((target) => (
            <Link
              key={target}
              href={target === league ? pathname : pairedCardsHref(pathname, base, BASES[target])}
              aria-current={target === league ? "page" : undefined}
              className={`rounded-full px-3 py-1 text-[11px] font-semibold uppercase tracking-wide transition ${
                target === league ? "border border-gold/60 bg-gold/15 text-gold" : "border border-line text-steel hover:text-white"
              }`}
            >
              {LEAGUE_LABELS[target]}
            </Link>
          ))}
        </div>
      </div>
      {active?.children ? (
        <div className="border-t border-line/60">
          <ul className="mx-auto flex w-full max-w-[1800px] flex-wrap items-center gap-x-4 gap-y-1 px-4 py-1.5 sm:px-6">
            {active.children.map((child) => {
              const current = activeChild?.href === child.href;
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    aria-current={current ? "page" : undefined}
                    title={child.blurb}
                    className={`inline-block border-b-2 px-0.5 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${
                      current ? "border-coral text-white" : "border-transparent text-steel hover:text-white"
                    }`}
                  >
                    {child.label}
                  </Link>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}
    </nav>
  );
}
