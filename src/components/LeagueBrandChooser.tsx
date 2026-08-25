"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { pairedLeagueHref, resolveLeagueFromPath } from "@/lib/league/links";
import type { LeagueView } from "@/lib/league/context";

type LeagueBrandChooserProps = {
  pathname: string;
  search: string;
  onNavigate: () => void;
};

const LABELS: Record<LeagueView, string> = {
  premier: "FPL",
  academy: "FPL Academy",
};

function BrandMark({ league }: { league: LeagueView }) {
  return (
    <span className="league-brand-mark">
      <Image src="/fpl-logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
      {league === "academy" ? <span aria-hidden="true" data-testid="academy-mark" className="league-brand-academy-mark">A</span> : null}
      <span className="text-sm font-bold tracking-[0.12em] text-white">{LABELS[league]}</span>
    </span>
  );
}

export default function LeagueBrandChooser({ pathname, search, onNavigate }: LeagueBrandChooserProps) {
  const current = resolveLeagueFromPath(pathname);
  const [open, setOpen] = useState(false);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const closeOnOutside = (event: MouseEvent) => {
      if (rootRef.current && !rootRef.current.contains(event.target as Node)) setOpen(false);
    };
    const closeOnEscape = (event: KeyboardEvent) => {
      if (event.key === "Escape") setOpen(false);
    };
    document.addEventListener("mousedown", closeOnOutside);
    document.addEventListener("keydown", closeOnEscape);
    return () => {
      document.removeEventListener("mousedown", closeOnOutside);
      document.removeEventListener("keydown", closeOnEscape);
    };
  }, [open]);

  const hrefFor = (league: LeagueView) =>
    league === current
      ? league === "academy"
        ? "/academy"
        : "/"
      : pairedLeagueHref(pathname, league, search);

  return (
    <div ref={rootRef} className="relative">
      <button
        type="button"
        aria-expanded={open}
        aria-haspopup="menu"
        aria-label={`${LABELS[current]}, choose league`}
        onClick={() => setOpen((value) => !value)}
        className="inline-flex items-center gap-2 rounded-md border border-line bg-navy px-3 py-2 transition hover:border-coral focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral"
      >
        <BrandMark league={current} />
        <span aria-hidden="true" className="text-xs text-steel">▾</span>
      </button>
      {open ? (
        <div role="menu" aria-label="League chooser" className="league-brand-menu absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-52 rounded-md border border-line p-1 shadow-xl">
          {(["premier", "academy"] as LeagueView[]).map((league) => (
            <Link
              key={league}
              role="menuitem"
              href={hrefFor(league)}
              aria-current={league === current ? "page" : undefined}
              onClick={() => {
                setOpen(false);
                onNavigate();
              }}
              className="flex w-full items-center rounded px-3 py-2 text-left hover:bg-panel focus-visible:bg-panel focus-visible:outline-none"
            >
              <BrandMark league={league} />
            </Link>
          ))}
        </div>
      ) : null}
    </div>
  );
}
