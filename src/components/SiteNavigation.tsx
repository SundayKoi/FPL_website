"use client";

import type { ReactNode } from "react";
import { useEffect, useId, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { usePathname } from "next/navigation";

const NAV_LINKS = [
  { href: "/", label: "Home" },
  { href: "/stats", label: "Stats" },
  { href: "/players", label: "Players" },
  { href: "/schedule", label: "Schedule" },
  { href: "/draft", label: "Draft" },
  { href: "/teams", label: "Teams" },
  { href: "/info", label: "Info" },
] as const;

const linkBase =
  "whitespace-nowrap text-xs font-semibold uppercase tracking-[0.16em] transition focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold";

function isActive(pathname: string | null, href: string) {
  if (href === "/") return pathname === "/";
  return pathname === href || (pathname?.startsWith(`${href}/`) ?? false);
}

export default function SiteNavigation({ authSlot }: { authSlot: ReactNode }) {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const menuId = useId();

  // Close the mobile menu whenever the route changes (e.g. browser
  // back/forward), adjusting state during render rather than in an effect.
  const [prevPathname, setPrevPathname] = useState(pathname);
  if (pathname !== prevPathname) {
    setPrevPathname(pathname);
    setOpen(false);
  }

  // Let Escape dismiss the open menu.
  useEffect(() => {
    if (!open) return;
    function onKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") setOpen(false);
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [open]);

  return (
    <header
      className="sticky top-0 z-40 border-b border-line backdrop-blur"
      style={{ backgroundColor: "rgba(0,18,31,0.9)" }}
    >
      <div className="relative mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="FPL Draft home">
          <Image src="/fpl-logo.png" width={30} height={30} alt="" />
          <span className="type-display text-base">
            FPL <span className="font-body not-italic text-steel">DRAFT</span>
          </span>
        </Link>

        <nav
          id={menuId}
          aria-label="Primary"
          data-open={open}
          className={`${
            open ? "flex" : "hidden"
          } absolute inset-x-0 top-full flex-col gap-1 border-b border-line px-2 py-2 shadow-lg backdrop-blur sm:static sm:flex sm:min-w-0 sm:flex-1 sm:flex-row sm:items-center sm:justify-between sm:gap-6 sm:border-0 sm:p-0 sm:shadow-none sm:backdrop-blur-0`}
          style={{ backgroundColor: "rgba(0,18,31,0.97)" }}
        >
          {NAV_LINKS.map((link) => {
            const active = isActive(pathname, link.href);
            return (
              <Link
                key={link.href}
                href={link.href}
                aria-current={active ? "page" : undefined}
                onClick={() => setOpen(false)}
                className={`${linkBase} rounded px-3 py-2 sm:px-0 sm:py-1 ${
                  active ? "text-white sm:text-gold" : "text-steel hover:text-white hover:bg-line/40 sm:hover:bg-transparent"
                }`}
              >
                {link.label}
              </Link>
            );
          })}
        </nav>

        <div className="ml-auto flex shrink-0 items-center gap-2">
          <div className="shrink-0">{authSlot}</div>
          <button
            type="button"
            onClick={() => setOpen((value) => !value)}
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
