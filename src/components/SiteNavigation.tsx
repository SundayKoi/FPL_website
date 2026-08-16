"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useRef, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { leaguePath, type LeaguePage } from "@/lib/league/links";

type DropdownLink = {
  href: string;
  label: string;
  target?: "_blank";
  rel?: "noopener noreferrer";
};

type DropdownKey = "premier" | "academy" | "info" | "premium";

const DROPDOWN_LINKS: Record<DropdownKey, readonly DropdownLink[]> = {
  premier: (["home", "players", "stats", "schedule", "teams", "captain"] as const).map((page) => ({
    href: leaguePath(page as LeaguePage, "premier"),
    label: page === "home" ? "Home" : page[0].toUpperCase() + page.slice(1),
  })),
  academy: (["home", "players", "stats", "schedule", "teams", "captain"] as const).map((page) => ({
    href: leaguePath(page as LeaguePage, "academy"),
    label: page === "home" ? "Home" : page[0].toUpperCase() + page.slice(1),
  })),
  info: [
    { href: "/signup", label: "Sign Up" },
    { href: "/league-links", label: "League Links" },
    { href: "/rulebook", label: "Rulebook" },
  ],
  premium: [
    { href: "/betting", label: "Betting" },
    {
      href: "https://www.draftleague.lol/",
      label: "Draft League",
      target: "_blank",
      rel: "noopener noreferrer",
    },
  ],
};

const DROPDOWNS = [
  { key: "premier", label: "Premier", links: DROPDOWN_LINKS.premier },
  { key: "academy", label: "Academy", links: DROPDOWN_LINKS.academy },
  { key: "premium", label: "Premium", links: DROPDOWN_LINKS.premium },
  { key: "info", label: "Info", links: DROPDOWN_LINKS.info },
] as const;

const linkBase =
  "whitespace-nowrap text-xs font-semibold uppercase tracking-[0.16em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold sm:text-sm lg:text-base";

function isActive(pathname: string | null, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

export default function SiteNavigation({ authSlot }: { authSlot: ReactNode }) {
  const pathname = usePathname();
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
      className="sticky top-0 z-40 border-b border-line backdrop-blur"
      style={{ backgroundColor: "rgba(0,18,31,0.9)" }}
    >
      <div className="relative flex w-full items-center gap-4 px-4 py-3 sm:min-h-[5.5rem] sm:gap-6 sm:px-8 sm:py-4 lg:px-10">
        <Link href="/" className="flex shrink-0 items-center gap-2 sm:gap-3" aria-label="FPL home">
          <Image
            src="/fpl-logo.png"
            width={44}
            height={44}
            alt=""
            className="h-[30px] w-[30px] sm:h-11 sm:w-11"
          />
          <span className="type-display text-base sm:text-2xl">FPL</span>
        </Link>

        <nav
          id={menuId}
          aria-label="Primary"
          data-open={open}
          className={`${
            open ? "flex" : "hidden"
          } absolute inset-x-0 top-full flex-col gap-1 border-b border-line px-2 py-2 shadow-lg backdrop-blur sm:static sm:flex sm:min-w-0 sm:flex-1 sm:flex-row sm:items-center sm:justify-evenly sm:gap-2 sm:border-0 sm:p-0 sm:shadow-none sm:backdrop-blur-0 lg:gap-6`}
          style={{ backgroundColor: "rgba(0,18,31,0.97)" }}
        >
          {DROPDOWNS.map((dropdown) => {
            const dropdownOpen = openDropdown === dropdown.key;
            const dropdownMenuId = `${menuId}-${dropdown.key}`;
            const active = dropdown.links.some((link) => isActive(pathname, link.href));

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
                  className={`${linkBase} inline-flex items-center gap-1 rounded px-3 py-2 sm:px-0 sm:py-1 ${
                    active || dropdownOpen
                      ? "text-white sm:text-gold"
                      : "text-steel hover:bg-line/40 hover:text-white sm:hover:bg-transparent"
                  }`}
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
                  </div>
                ) : null}
              </div>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
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
            className="inline-flex h-9 w-9 items-center justify-center rounded border border-line text-steel transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-gold sm:hidden"
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
