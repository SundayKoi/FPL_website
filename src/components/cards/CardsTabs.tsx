"use client";

// The tab bar on every cards page.
//
// Two rows: the six tabs, and — when the tab you are on has pages under it
// — those pages. It replaces the hub's thirteen-link menu and the "← Back
// to player cards" link that was the only way off every sub-page. On a
// phone each row scrolls sideways rather than wrapping into three, so the
// bar stays a bar. Switching league is the header's job (the brand chooser
// pairs every cards page), so there is one switcher on the page, not two.

import Link from "next/link";
import { usePathname } from "next/navigation";
import type { CardLeague } from "@/lib/cards/queries";
import { activeCardsSection, cardsSections } from "@/lib/cards/sections";

const BASES: Record<CardLeague, string> = { premier: "/cards", academy: "/academy/cards" };

export default function CardsTabs({ league }: { league: CardLeague }) {
  const pathname = usePathname() ?? BASES[league];
  const base = BASES[league];
  const sections = cardsSections(base);
  const { section: active, child: activeChild } = activeCardsSection(sections, pathname);

  return (
    <nav aria-label="Cards" className="border-b border-line bg-panel/60">
      <div className="mx-auto w-full max-w-[1800px] px-4 py-2 sm:px-6">
        <ul className="flex items-center gap-1 overflow-x-auto pb-1 sm:flex-wrap sm:overflow-visible sm:pb-0">
          {sections.map((section) => {
            const current = active?.key === section.key;
            return (
              <li key={section.key}>
                <Link
                  href={section.href}
                  aria-current={current ? "page" : undefined}
                  title={section.blurb}
                  className={`inline-block shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-xs font-semibold uppercase tracking-[0.14em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral sm:text-sm ${
                    current ? "bg-coral text-navy" : "text-steel hover:bg-line/40 hover:text-white"
                  }`}
                >
                  {section.label}
                </Link>
              </li>
            );
          })}
        </ul>
      </div>
      {active?.children ? (
        <div className="border-t border-line/60">
          <ul className="mx-auto flex w-full max-w-[1800px] items-center gap-x-4 gap-y-1 overflow-x-auto px-4 py-1.5 sm:flex-wrap sm:overflow-visible sm:px-6">
            {active.children.map((child) => {
              const current = activeChild?.href === child.href;
              return (
                <li key={child.href}>
                  <Link
                    href={child.href}
                    aria-current={current ? "page" : undefined}
                    title={child.blurb}
                    className={`inline-block shrink-0 whitespace-nowrap border-b-2 px-0.5 py-1 text-xs font-semibold transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral ${
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
