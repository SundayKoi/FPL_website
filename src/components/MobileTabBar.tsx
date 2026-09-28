"use client";

// Five tabs along the bottom of the screen on a phone.
//
// On a phone the whole header collapses into a hamburger, and every page
// is two taps and a dropdown away — the least usable way to get around a
// site on a touchscreen, and people said the site was hard to find things
// on. These five are where most visits go; everything else is still in
// the menu and in search.

import Link from "next/link";
import { usePathname } from "next/navigation";
import { leaguePath, resolveLeagueFromPath } from "@/lib/league/links";

/** Full-screen tools where a bar along the bottom would sit on the work. */
const HIDDEN_ON = ["/admin", "/broadcaster", "/draft/", "/drafter", "/match-draft"];

function under(pathname: string, prefixes: string[]): boolean {
  return prefixes.some((prefix) => pathname === prefix || pathname.startsWith(prefix.endsWith("/") ? prefix : `${prefix}/`));
}

type Tab = { label: string; href: string; active: boolean; icon: string };

export function mobileTabs(pathname: string): Tab[] {
  const league = resolveLeagueFromPath(pathname);
  const prefix = league === "academy" ? "/academy" : "";
  const home = leaguePath("home", league);
  const leaguePages = ["players", "teams", "schedule", "standings", "stats"].map((page) => `${prefix}/${page}`);
  return [
    { label: "Home", href: home, active: pathname === home, icon: "M3 11 12 4l9 7M5 10v10h14V10" },
    {
      label: "League",
      href: leaguePath("schedule", league),
      active: under(pathname, leaguePages),
      icon: "M4 6h16M4 12h16M4 18h10",
    },
    {
      label: "Cards",
      href: `${prefix}/cards`,
      active: under(pathname, [`${prefix}/cards`, "/card", "/binder"]),
      icon: "M7 3h10a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2Z",
    },
    {
      label: "Games",
      href: league === "academy" ? "/premium?league=academy" : "/premium",
      active: under(pathname, ["/premium", "/betting", "/bangers", `${prefix}/fpldle`, `${prefix}/higher-lower`, `${prefix}/guess-the-card`]),
      icon: "M6 12h4m-2-2v4m7-1h.01M18 11h.01M8 6h8a6 6 0 0 1 0 12H8A6 6 0 0 1 8 6Z",
    },
    {
      label: "My Team",
      href: leaguePath("my-team", league),
      active: under(pathname, [leaguePath("my-team", league)]),
      icon: "M12 12a4 4 0 1 0 0-8 4 4 0 0 0 0 8Zm-7 9a7 7 0 0 1 14 0",
    },
  ];
}

export default function MobileTabBar() {
  const pathname = usePathname() ?? "/";
  if (under(pathname, HIDDEN_ON)) return null;
  return (
    <>
      {/* Holds the page's last lines clear of the fixed bar. */}
      <div aria-hidden="true" className="h-16 md:hidden" />
      <nav
        aria-label="Quick links"
        className="fixed inset-x-0 bottom-0 z-40 border-t border-gold/30 bg-[rgba(0,18,31,0.97)] pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden"
      >
        <ul className="grid grid-cols-5">
          {mobileTabs(pathname).map((tab) => (
            <li key={tab.label}>
              <Link
                href={tab.href}
                aria-current={tab.active ? "page" : undefined}
                className={`flex h-14 flex-col items-center justify-center gap-0.5 text-[11px] font-semibold transition ${
                  tab.active ? "text-coral" : "text-steel hover:text-white"
                }`}
              >
                <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                  <path d={tab.icon} />
                </svg>
                {tab.label}
              </Link>
            </li>
          ))}
        </ul>
      </nav>
    </>
  );
}
