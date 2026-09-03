"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import LeagueBrandChooser from "./LeagueBrandChooser";
import SiteSearch from "./SiteSearch";
import { leagueNavigationLinks } from "@/lib/league/navigation";
import { leaguePath, resolveLeagueFromPath } from "@/lib/league/links";
import type { LeagueView } from "@/lib/league/context";

type DropdownLink = {
  href: string;
  label: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
};

type DropdownKey = "league" | "premium" | "info";

const SHARED_DROPDOWNS: readonly { key: DropdownKey; label: string; links: readonly DropdownLink[] }[] = [
  {
    key: "info",
    label: "Info",
    links: [
      { href: "/info", label: "Info" },
      { href: "/signup", label: "Sign Up" },
      { href: "/league-links", label: "League Links" },
      { href: "/rulebook", label: "Rulebook" },
      { href: "/supporters", label: "Patrons" },
      { href: "/support-devs", label: "Support the Devs" },
    ],
  },
];

function premiumDropdownLinks(premiumHref: string, view: LeagueView): DropdownLink[] {
  // The daily games are destinations of their own, not an anchor on the
  // hub: "Daily Games" landed people half-way down a page and they had to
  // find the game again from there.
  const prefix = view === "academy" ? "/academy" : "";
  return [
    { href: premiumHref, label: "Premium HQ" },
    { href: "/betting", label: "Betting" },
    { href: "/bangers", label: "The Daily Stu" },
    { href: "/drafter", label: "Match Drafter" },
    { href: `${prefix}/fpldle`, label: "FPL'dle" },
    { href: `${prefix}/higher-lower`, label: "Higher or Lower" },
    { href: `${prefix}/guess-the-card`, label: "Guess the Card" },
  ];
}

function leagueDropdownLinks(view: LeagueView, showBroadcaster: boolean): DropdownLink[] {
  const links = [
    ["Players", "players"],
    ["Teams", "teams"],
    ["Schedule", "schedule"],
  ].map(([label, page]) => ({
    href: leaguePath(page as "players" | "teams" | "schedule", view),
    label,
  }));

  return [
    ...links,
    ...(showBroadcaster ? [{ href: "/broadcaster", label: "Broadcaster" }] : []),
    { href: "/draft", label: "Auction Draft" },
  ];
}

const linkBase =
  "whitespace-nowrap text-xs font-semibold uppercase tracking-[0.16em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-coral sm:text-sm lg:text-base";

function topLinkClass(active: boolean, extra = "") {
  return `${linkBase} ${extra ? `${extra} ` : ""}rounded px-3 py-2 sm:px-0 sm:py-1 ${
    active ? "text-white sm:text-coral" : "text-steel hover:text-gold hover:bg-line/40 sm:hover:bg-transparent"
  }`;
}

function isActive(pathname: string | null, href: string) {
  const path = href.split("?")[0];
  if (path === "/") return pathname === "/";
  return pathname === path || (pathname?.startsWith(`${path}/`) ?? false);
}

function isPremiumActive(pathname: string | null) {
  return PREMIUM_ACTIVE_PREFIXES.some((href) => isActive(pathname, href));
}

// Cards owns both leagues' collection hubs plus the single-card share page and
// the public binder view, none of which live under a /cards prefix.
const CARDS_ACTIVE_PREFIXES = ["/cards", "/academy/cards", "/card", "/binder"];
const PREMIUM_ACTIVE_PREFIXES = [
  "/premium",
  "/betting",
  "/bangers",
  "/drafter",
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
  const directLinks = leagueNavigationLinks(league).filter((link) => link.label === "Stats" || link.label === "My Team");
  const dropdowns = [
    { key: "premium" as const, label: "Premium", links: premiumDropdownLinks(premiumHref, league) },
    { key: "league" as const, label: "League", links: leagueDropdownLinks(league, showBroadcaster) },
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
          } absolute inset-x-0 top-full flex-col gap-1 border-b border-line px-2 py-2 shadow-lg backdrop-blur sm:static sm:flex sm:min-w-0 sm:flex-1 sm:flex-row sm:items-center sm:justify-evenly sm:gap-2 sm:border-0 sm:p-0 sm:shadow-none sm:backdrop-blur-0 lg:gap-6`}
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
          <Link
            href={cardsHref}
            aria-current={isCardsActive(pathname) ? "page" : undefined}
            onClick={closeMenus}
            className={topLinkClass(isCardsActive(pathname))}
          >
            Cards
          </Link>
          {dropdowns.map((dropdown) => {
            const dropdownOpen = openDropdown === dropdown.key;
            const dropdownMenuId = `${menuId}-${dropdown.key}`;
            const active = dropdown.key === "premium" ? isPremiumActive(pathname) : dropdown.links.some((link) => isActive(pathname, link.href));

            return (
              <div key={dropdown.key} className="relative flex flex-col sm:items-center">
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
                    className="flex flex-col gap-1 pl-3 pt-1 sm:absolute sm:left-1/2 sm:top-full sm:z-50 sm:mt-3 sm:min-w-40 sm:-translate-x-1/2 sm:rounded sm:border sm:border-line sm:bg-navy sm:p-2 sm:shadow-lg"
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
                    {dropdown.key === "info" && showAdmin ? (
                      <div className="mt-1 border-t border-line pt-1" aria-label="Staff">
                        {showAdmin ? (
                          <Link
                            href="/admin"
                            role="menuitem"
                            aria-current={isActive(pathname, "/admin") ? "page" : undefined}
                            onClick={closeMenus}
                            className={`${linkBase} rounded px-3 py-2 text-steel hover:bg-line/40 hover:text-white sm:px-3 sm:py-2 sm:text-sm`}
                          >
                            Admin
                          </Link>
                        ) : null}
                      </div>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <SiteSearch league={league} />
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
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-line text-steel transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral sm:hidden"
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
