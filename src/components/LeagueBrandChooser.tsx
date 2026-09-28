"use client";

import Link from "next/link";
import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import { pairedLeagueHref } from "@/lib/league/links";
import { leagueChoiceCookie } from "@/lib/league/preference";
import type { LeagueView } from "@/lib/league/context";
import { resolveThemeLeague } from "@/lib/league/theme";
import styles from "./SiteNavigation.module.css";

type LeagueBrandChooserProps = {
  pathname: string;
  search: string;
  onNavigate: () => void;
  homeStyle?: boolean;
};

const LABELS: Record<LeagueView, string> = {
  premier: "FPL",
  academy: "FPL Academy",
};
const SELECTOR_LABELS: Record<LeagueView, string> = {
  premier: "Premier",
  academy: "Academy",
};
const DIVISIONS: Record<LeagueView, string> = {
  premier: "Premier division",
  academy: "Academy division",
};

function BrandMark({ league }: { league: LeagueView }) {
  return (
    <span className="league-brand-mark">
      <Image src="/fpl-logo.png" alt="" width={28} height={28} className="h-7 w-7 object-contain" />
      {league === "academy" ? <span aria-hidden="true" data-testid="academy-mark" className="league-brand-academy-mark">A</span> : null}
      <span className="league-brand-copy">
        <span className="text-sm font-bold tracking-[0.12em] text-content">{LABELS[league]}</span>
        <span className="league-brand-division">{DIVISIONS[league]}</span>
      </span>
    </span>
  );
}

export default function LeagueBrandChooser({ pathname, search, onNavigate, homeStyle = false }: LeagueBrandChooserProps) {
  const current = resolveThemeLeague(pathname, search);
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

  if (!homeStyle) {
    return (
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`${LABELS[current]}, ${DIVISIONS[current]}, choose league`}
          onClick={() => setOpen((value) => !value)}
          className="inline-flex items-center gap-1 rounded-md border border-border-strong bg-surface px-2 py-2 transition hover:border-action-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus sm:gap-2 sm:px-3"
        >
          <BrandMark league={current} />
          <span aria-hidden="true" className="text-xs text-muted">▾</span>
        </button>
        {open ? (
          <div role="menu" aria-label="League chooser" className="league-brand-menu absolute left-0 top-[calc(100%+0.5rem)] z-50 min-w-52 rounded-md border border-border-subtle p-1 shadow-xl">
            {(["premier", "academy"] as LeagueView[]).map((league) => (
              <Link
                key={league}
                role="menuitem"
                href={hrefFor(league)}
                aria-current={league === current ? "page" : undefined}
                aria-label={`${LABELS[league]}, ${DIVISIONS[league]}`}
                onClick={() => {
                  // Remembered, so the home page opens in this league next
                  // time (src/lib/league/preference.ts).
                  document.cookie = leagueChoiceCookie(league);
                  setOpen(false);
                  onNavigate();
                }}
                className="flex w-full items-center rounded px-3 py-2 text-left hover:bg-raised focus-visible:bg-raised focus-visible:outline-none"
              >
                <BrandMark league={league} />
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    );
  }

  return (
    <div className={styles.brandAndLeague}>
      <Link
        href={current === "academy" ? "/academy" : "/"}
        onClick={onNavigate}
        aria-label="FPL home"
        className={styles.brandIdentity}
      >
        <Image
          src="/fpl-logo.png"
          alt=""
          width={44}
          height={44}
          className={styles.brandSigil}
        />
        <span className={styles.brandName}>FPL</span>
      </Link>
      <span aria-hidden="true" className={styles.brandDivider} />
      <div ref={rootRef} className="relative">
        <button
          type="button"
          aria-expanded={open}
          aria-haspopup="menu"
          aria-label={`${LABELS[current]}, ${DIVISIONS[current]}, choose league`}
          onClick={() => setOpen((value) => !value)}
          className={styles.leagueSelectorTrigger}
        >
          {current === "academy" ? <span aria-hidden="true" data-testid="academy-mark" className="league-brand-academy-mark">A</span> : null}
          <span>{SELECTOR_LABELS[current]}</span>
          <span aria-hidden="true" className={styles.selectorChevron}>▾</span>
        </button>
        {open ? (
          <div role="menu" aria-label="League chooser" className={`league-brand-menu ${styles.leagueMenu}`}>
            {(["premier", "academy"] as LeagueView[]).map((league) => (
              <Link
                key={league}
                role="menuitem"
                href={hrefFor(league)}
                aria-current={league === current ? "page" : undefined}
                aria-label={`${LABELS[league]}, ${DIVISIONS[league]}`}
                onClick={() => {
                  // Remembered, so the home page opens in this league next
                  // time (src/lib/league/preference.ts).
                  document.cookie = leagueChoiceCookie(league);
                  setOpen(false);
                  onNavigate();
                }}
                className={styles.leagueMenuLink}
              >
                <span className={styles.leagueMenuCopy}>
                  <span>{SELECTOR_LABELS[league]}</span>
                  <span>{DIVISIONS[league]}</span>
                </span>
                {league === "academy" ? <span aria-hidden="true" className="league-brand-academy-mark">A</span> : null}
                {league === current ? <span aria-hidden="true" className={styles.currentLeagueMark}>✓</span> : null}
              </Link>
            ))}
          </div>
        ) : null}
      </div>
    </div>
  );
}
