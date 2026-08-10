import type { ReactNode } from "react";
import Image from "next/image";
import Link from "next/link";

const linkClass =
  "whitespace-nowrap text-xs font-semibold uppercase tracking-[0.16em] text-steel transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-4 focus-visible:outline-gold";

export default function SiteNavigation({ authSlot }: { authSlot: ReactNode }) {
  return (
    <header
      className="sticky top-0 z-40 border-b border-line backdrop-blur"
      style={{ backgroundColor: "rgba(0,18,31,0.9)" }}
    >
      <div className="mx-auto flex w-full max-w-7xl items-center gap-4 px-4 py-3 sm:px-6">
        <Link href="/" className="flex shrink-0 items-center gap-2" aria-label="FPL Draft home">
          <Image src="/fpl-logo.png" width={30} height={30} alt="" />
          <span className="type-display text-base">
            FPL <span className="font-body not-italic text-steel">DRAFT</span>
          </span>
        </Link>
        <nav
          aria-label="Primary"
          className="flex min-w-0 flex-1 items-center gap-4 overflow-x-auto py-1 sm:gap-6"
        >
          <Link href="/" className={linkClass}>
            Home
          </Link>
          <Link href="/stats" className={linkClass}>
            Stats
          </Link>
          <Link href="/schedule" className={linkClass}>
            Schedule
          </Link>
          <Link href="/draft" className={linkClass}>
            Draft
          </Link>
          <Link href="/teams" className={linkClass}>
            Teams
          </Link>
          <Link href="/info" className={linkClass}>
            Info
          </Link>
        </nav>
        <div className="shrink-0">{authSlot}</div>
      </div>
    </header>
  );
}
