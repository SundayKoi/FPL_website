"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import LeagueBrandChooser from "./LeagueBrandChooser";
import SiteSearch from "./SiteSearch";
import { leagueNavigationLinks } from "@/lib/league/navigation";
import { leaguePath, resolveLeagueFromPath } from "@/lib/league/links";
import { cardsSections } from "@/lib/cards/sections";
import type { LeagueView } from "@/lib/league/context";

type DropdownLink = {
  href: string;
  label: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
};

type DropdownKey = "league" | "cards" | "play" | "info";

// Four menus of four to six, one per question a visitor asks: what is
// the league doing (League), what can I collect (Cards), what can I play
// (Play), how does this all work (About). The old header had 2 / 7 / 5 /
// 6 — Stats at the top level while Players sat in a menu, the two drafts
// under two different menus, and the daily games at the bottom of a
// seven-item Premium menu.
const SHARED_DROPDOWNS: readonly { key: DropdownKey; label: string; links: readonly DropdownLink[] }[] = [
  {
    key: "info",
    label: "About",
    links: [
      { href: "/info", label: "About the league" },
      { href: "/rulebook", label: "Rulebook" },
      { href: "/league-links", label: "League Links" },
      { href: "/membership", label: "Premium & Patron" },
      { href: "/economy", label: "Betting dollars" },
      { href: "/supporters", label: "Patrons" },
      { href: "/support-devs", label: "Support the Devs" },
      { href: "/signup", label: "Sign Up" },
    ],
  },
];

function playDropdownLinks(premiumHref: string, view: LeagueView, showTesting: boolean): DropdownLink[] {
  // The daily games are destinations of their own, not an anchor on the
  // hub: "Daily Games" landed people half-way down a page and they had to
  // find the game again from there.
  const prefix = view === "academy" ? "/academy" : "";
  return [
    { href: premiumHref, label: "Premium HQ" },
    { href: "/betting", label: "Betting" },
    { href: "/bangers", label: "The Daily Stu" },
    { href: `${prefix}/fpldle`, label: "FPL'dle" },
    { href: `${prefix}/higher-lower`, label: "Higher or Lower" },
    // Still in admin testing: a member who clicked it was bounced straight
    // back to Premium HQ with no explanation.
    ...(showTesting ? [{ href: `${prefix}/guess-the-card`, label: "Guess the Card" }] : []),
  ];
}

// Cards hid sixteen pages behind one header word, and that word walled
// non-members: a signed-out visitor could not reach the public Browse,
// Moments or Vault from the menu at all. Browse first, because it is the
// one door open to everyone; the hub and the five tabs after it.
function cardsDropdownLinks(base: string): DropdownLink[] {
  const sections = cardsSections(base);
  const browse = sections.find((section) => section.key === "browse");
  const rest = sections.filter((section) => section.key !== "browse");
  return [
    ...(browse ? [{ href: browse.href, label: browse.label }] : []),
    ...rest.map((section) => ({ href: section.href, label: section.key === "home" ? "Cards home" : section.label })),
  ];
}

function leagueDropdownLinks(view: LeagueView, showBroadcaster: boolean): DropdownLink[] {
  const links = [
    ["Players", "players"],
    ["Teams", "teams"],
    ["Schedule", "schedule"],
    ["Standings", "standings"],
    ["Stats", "stats"],
  ].map(([label, page]) => ({
    href: leaguePath(page as "players" | "teams" | "schedule" | "standings" | "stats", view),
    label,
  }));

  // Both drafts live here: the auction that builds the rosters and the
  // pick/ban tool for playing the games. They were under two menus.
  return [
    ...links,
    { href: "/draft", label: "Auction Draft" },
    { href: "/drafter", label: "Match Drafter" },
    ...(showBroadcaster ? [{ href: "/broadcaster", label: "Broadcaster" }] : []),
  ];
}

const linkBase =
  "whitespace-nowrap text-xs font-semibold uppercase tracking-[0.16em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral sm:text-sm lg:text-base";

function topLinkClass(active: boolean, extra = "") {
  return `${linkBase} ${extra ? `${extra} ` : ""}rounded px-3 py-2 md:px-0 md:py-1 ${
    active ? "text-white md:text-coral" : "text-steel hover:text-gold hover:bg-line/40 md:hover:bg-transparent"
  }`;
}

function isActive(pathname: string | null, href: string) {
  const path = href.split("?")[0];
  if (path === "/") return pathname === "/";
  return pathname === path || (pathname?.startsWith(`${path}/`) ?? false);
}

function isPlayActive(pathname: string | null) {
  return PLAY_ACTIVE_PREFIXES.some((href) => isActive(pathname, href));
}

// Cards owns both leagues' collection hubs plus the single-card share page and
// the public binder view, none of which live under a /cards prefix.
const CARDS_ACTIVE_PREFIXES = ["/cards", "/academy/cards", "/card", "/binder"];
const PLAY_ACTIVE_PREFIXES = [
  "/premium",
  "/betting",
  "/bangers",
  "/fpldle",
  "/higher-lower",
  "/guess-the-card",
  "/academy/fpldle",
  "/academy/higher-lower",
  "/academy/guess-the-card",
];

function isCardsActive(pathname: string | null) {
  return CARDS_ACTIVE_PREFIXES.some((href) => isActive(pathname, href));
}

export default function SiteNavigation({
  authSlot,
  showAdmin = false,
  showBroadcaster = false,
}: {
  authSlot: ReactNode;
  /** Renders the Admin hub link — set server-side for signed-in admins/owners
   * only. Presentation only; /admin re-checks the staff tier and redirects. */
  showAdmin?: boolean;
  /** Renders the Broadcaster workspace link — set server-side for owners and
   * broadcasters only. Presentation only; /broadcaster re-checks access. */
  showBroadcaster?: boolean;
}) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const league = resolveLeagueFromPath(pathname ?? "/");
  const premiumHref =
    league === "academy" || (pathname === "/premium" && searchParams?.get("league") === "academy")
      ? "/premium?league=academy"
      : "/premium";
  const cardsHref = league === "academy" ? "/academy/cards" : "/cards";
  // My Team stays at the top level: it is the one personal page, and the
  // one a captain opens most. Everything else is in one of four menus.
  const directLinks = leagueNavigationLinks(league).filter((link) => link.label === "My Team");
  const dropdowns = [
    { key: "league" as const, label: "League", links: leagueDropdownLinks(league, showBroadcaster) },
    { key: "cards" as const, label: "Cards", links: cardsDropdownLinks(cardsHref) },
    { key: "play" as const, label: "Play", links: playDropdownLinks(premiumHref, league, showAdmin) },
    ...SHARED_DROPDOWNS,
  ];
  const [open, setOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  const menuId = useId();
  const navRef = useRef<HTMLElement | null>(null);

  const closeMenus = () => {
    setOpen(false);
    setOpenDropdown(null);
  };

  // Close the mobile menu whenever the route changes (e.g. browser
  // back/forward), adjusting state during render rather than in an effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    closeMenus();
  }

  // Let Escape dismiss the open dropdown or mobile menu.
  useEffect(() => {
    if (!open && !openDropdown) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key !== "Escape") return;
      if (openDropdown) {
        setOpenDropdown(null);
      } else {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open, openDropdown]);

  useEffect(() => {
    if (!openDropdown) return;
    function onPointerDown(event: PointerEvent) {
      if (!navRef.current?.contains(event.target as Node)) setOpenDropdown(null);
    }
    document.addEventListener("pointerdown", onPointerDown);
    return () => document.removeEventListener("pointerdown", onPointerDown);
  }, [openDropdown]);

  return (
    <header
      ref={navRef}
      className="sticky top-0 z-40 border-b border-gold/30 backdrop-blur"
      style={{ backgroundColor: "rgba(0,18,31,0.9)" }}
    >
      <div className="relative flex w-full items-center gap-4 px-4 py-3 sm:min-h-[5.5rem] sm:gap-6 sm:px-8 sm:py-4 lg:px-10">
        <LeagueBrandChooser
          pathname={pathname ?? "/"}
          search={searchParams?.toString() ?? ""}
          onNavigate={closeMenus}
        />

        <nav
          id={menuId}
          aria-label="Primary"
          data-open={open}
          className={`${
            open ? "flex" : "hidden"
          } absolute inset-x-0 top-full flex-col gap-1 border-b border-line px-2 py-2 shadow-lg backdrop-blur md:static md:flex md:min-w-0 md:flex-1 md:flex-row md:items-center md:justify-evenly md:gap-2 md:border-0 md:p-0 md:shadow-none md:backdrop-blur-0 lg:gap-6`}
          style={{ backgroundColor: "rgba(0,18,31,0.97)" }}
        >
          {directLinks.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={closeMenus}
                className={topLinkClass(active)}
              >
                {link.label}
              </Link>
            );
          })}
          {dropdowns.map((dropdown) => {
            const dropdownOpen = openDropdown === dropdown.key;
            const dropdownMenuId = `${menuId}-${dropdown.key}`;
            const active =
              dropdown.key === "play"
                ? isPlayActive(pathname)
                : dropdown.key === "cards"
                  ? isCardsActive(pathname)
                  : dropdown.links.some((link) => isActive(pathname, link.href));

            return (
              <div key={dropdown.key} className="relative flex flex-col md:items-center">
                <button
                  type="button"
                  aria-label={`${dropdown.label} menu`}
                  aria-haspopup="menu"
                  aria-expanded={dropdownOpen}
                  aria-controls={dropdownMenuId}
                  aria-current={active ? "page" : undefined}
                  onClick={() =>
                    setOpenDropdown((current) => (current === dropdown.key ? null : dropdown.key))
                  }
                  className={topLinkClass(active || dropdownOpen, "inline-flex items-center gap-1")}
                >
                  {dropdown.label}
                  <span aria-hidden="true" className="text-[0.7em]">
                    ▾
                  </span>
                </button>
                {dropdownOpen ? (
                  <div
                    id={dropdownMenuId}
                    role="menu"
                    className="flex flex-col gap-1 pl-3 pt-1 md:absolute md:left-1/2 md:top-full md:z-50 md:mt-3 md:min-w-40 md:-translate-x-1/2 md:rounded md:border md:border-line md:bg-navy md:p-2 md:shadow-lg"
                  >
                    {dropdown.links.map((dropdownLink) => (
                      <Link
                        key={dropdownLink.href}
                        href={dropdownLink.href}
                        role="menuitem"
                        target={dropdownLink.target}
                        rel={dropdownLink.rel}
                        aria-current={isActive(pathname, dropdownLink.href) ? "page" : undefined}
                        onClick={closeMenus}
                        className={`${linkBase} rounded px-3 py-2 text-steel hover:bg-line/40 hover:text-white sm:px-3 sm:py-2 sm:text-sm`}
                      >
                        {dropdownLink.label}
                      </Link>
                    ))}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SiteSearch league={league} />
          {showAdmin ? (
            // Staff-only, beside the avatar rather than buried in About.
            // Presentation only; /admin re-checks the staff tier.
            <Link
              href="/admin"
              aria-current={isActive(pathname, "/admin") ? "page" : undefined}
              className="hidden rounded-full border border-border-strong px-3 py-1 text-xs font-semibold uppercase tracking-wide text-muted transition hover:border-action-text hover:text-white md:inline-flex"
            >
              Admin
            </Link>
          ) : null}
          <div className="shrink-0">{authSlot}</div>
          <button
            type="button"
            onClick={() => {
              setOpen((value) => !value);
              setOpenDropdown(null);
            }}
            aria-expanded={open}
            aria-controls={menuId}
            aria-label={open ? "Close menu" : "Open menu"}
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-line text-steel transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral md:hidden"
          >
            {open ? (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M6 6l12 12M18 6L6 18" />
              </svg>
            ) : (
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                aria-hidden="true"
              >
                <path d="M4 7h16M4 12h16M4 17h16" />
              </svg>
            )}
          </button>
        </div>
      </div>
    </header>
  );
}
