"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import LeagueBrandChooser from "./LeagueBrandChooser";
import SiteSearch from "./SiteSearch";
import { leagueNavigationLinks } from "@/lib/league/navigation";
import { resolveLeagueFromPath } from "@/lib/league/links";
import { headerMenus, type MenuKey } from "@/lib/site/menus";

type DropdownKey = MenuKey;

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
  const adminSection = pathname?.startsWith("/admin") ?? false;
  const league = resolveLeagueFromPath(pathname ?? "/");
  const premiumHref =
    league === "academy" || (pathname === "/premium" && searchParams?.get("league") === "academy")
      ? "/premium?league=academy"
      : "/premium";
  // My Team stays at the top level: it is the one personal page, and the
  // one a captain opens most. Everything else is in one of four menus
  // (src/lib/site/menus.ts), each with its most-used pages first.
  const directLinks = leagueNavigationLinks(league).filter((link) => link.label === "My Team");
  const dropdowns = headerMenus({ league, premiumHref, showBroadcaster, showTesting: showAdmin });
  const [open, setOpen] = useState(false);
  const [openDropdown, setOpenDropdown] = useState<DropdownKey | null>(null);
  // Which open menu is showing its "More" pages. Closing a menu folds it.
  const [expanded, setExpanded] = useState<DropdownKey | null>(null);
  const menuId = useId();
  const navRef = useRef<HTMLElement | null>(null);

  const closeMenus = () => {
    setOpen(false);
    setOpenDropdown(null);
    setExpanded(null);
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
      style={{
        backgroundColor: adminSection ? "rgba(20,20,23,0.97)" : "rgba(0,18,31,0.9)",
        borderColor: adminSection ? "#303036" : undefined,
      }}
    >
      <div className="relative flex w-full items-center gap-2 page-container py-3 sm:min-h-[5.5rem] sm:gap-6 sm:py-4">
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
          style={{ backgroundColor: adminSection ? "rgba(20,20,23,0.99)" : "rgba(0,18,31,0.97)" }}
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
            const showMore = expanded === dropdown.key;
            const active =
              dropdown.activePrefixes.some((href) => isActive(pathname, href)) ||
              [...dropdown.links, ...dropdown.more].some((link) => isActive(pathname, link.href));

            return (
              <div key={dropdown.key} className="relative flex flex-col md:items-center">
                <button
                  type="button"
                  aria-label={`${dropdown.label} menu`}
                  aria-haspopup="menu"
                  aria-expanded={dropdownOpen}
                  aria-controls={dropdownMenuId}
                  aria-current={active ? "page" : undefined}
                  onClick={() => {
                    setExpanded(null);
                    setOpenDropdown((current) => (current === dropdown.key ? null : dropdown.key));
                  }}
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
                    {[...dropdown.links, ...(showMore ? dropdown.more : [])].map((dropdownLink) => (
                      <Link
                        key={dropdownLink.href}
                        href={dropdownLink.href}
                        role="menuitem"
                        aria-current={isActive(pathname, dropdownLink.href) ? "page" : undefined}
                        onClick={closeMenus}
                        className={`${linkBase} rounded px-3 py-2 text-steel hover:bg-line/40 hover:text-white sm:px-3 sm:py-2 sm:text-sm`}
                      >
                        {dropdownLink.label}
                      </Link>
                    ))}
                    {dropdown.more.length && !showMore ? (
                      <button
                        type="button"
                        role="menuitem"
                        onClick={() => setExpanded(dropdown.key)}
                        className={`${linkBase} rounded px-3 py-2 text-left text-muted hover:bg-line/40 hover:text-white sm:px-3 sm:py-2 sm:text-sm`}
                      >
                        More…
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="site-navigation-actions ml-auto flex shrink-0 items-center gap-1 sm:gap-2">
          <SiteSearch league={league} />
          {showAdmin ? (
            // Staff-only, beside the avatar rather than buried in About.
            // Presentation only; /admin re-checks the staff tier.
            <Link
              href="/admin"
              aria-current={isActive(pathname, "/admin") ? "page" : undefined}
              className={`hidden rounded-full border px-3 py-1 text-xs font-semibold uppercase tracking-wide transition md:inline-flex ${
                adminSection
                  ? "border-[#6241a5] text-[#c8b5ff] hover:border-[#b59aff] hover:text-white"
                  : "border-border-strong text-muted hover:border-action-text hover:text-white"
              }`}
            >
              Admin
            </Link>
          ) : null}
          <div className="site-navigation-auth shrink-0">{authSlot}</div>
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
