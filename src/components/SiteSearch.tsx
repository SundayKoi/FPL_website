"use client";

// The search palette: ⌘K anywhere, or the button in the header.
//
// The site has a hundred routes behind nineteen header links, and the thing
// people said most was "I can't find it". This is the answer for the person
// who knows the name of what they want: type a page, a player or a team and
// go. Pages come from the site map (src/lib/site/directory.ts) and are on
// the client already; players and teams are one fetch the first time the
// palette opens, kept for the rest of the visit.

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useId, useMemo, useRef, useState } from "react";
import type { LeagueView } from "@/lib/league/context";
import { siteDestinations } from "@/lib/site/directory";
import { rankSearch, type SearchItem } from "@/lib/site/search";

/** Loaded once per visit, shared by every palette instance. */
let indexPromise: Promise<SearchItem[]> | null = null;
function loadIndex(): Promise<SearchItem[]> {
  if (!indexPromise) {
    indexPromise = fetch("/api/search/index")
      .then((response) => (response.ok ? response.json() : { players: [], teams: [] }))
      .then((data: { players?: SearchItem[]; teams?: SearchItem[] }) => [...(data.players ?? []), ...(data.teams ?? [])])
      .catch(() => {
        // Let the next open try again rather than remembering a failure.
        indexPromise = null;
        return [];
      });
  }
  return indexPromise;
}

/** What the empty palette offers: the places most people are going. */
const SUGGESTED = ["Players", "Teams", "Schedule", "Stats", "Cards", "Packs", "Betting", "FPL'dle"];

const KIND_LABEL: Record<SearchItem["kind"], string> = { page: "Page", player: "Player", team: "Team" };

export default function SiteSearch({ league }: { league: LeagueView }) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [cursor, setCursor] = useState(0);
  const [remote, setRemote] = useState<SearchItem[] | null>(null);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listId = useId();

  const pages = useMemo<SearchItem[]>(
    () =>
      siteDestinations(league).map((item) => ({
        kind: "page",
        label: item.label,
        href: item.href,
        hint: item.group,
        keywords: item.keywords,
      })),
    [league],
  );

  const results = useMemo<SearchItem[]>(() => {
    if (query.trim()) return rankSearch(query, [...pages, ...(remote ?? [])], 12);
    return SUGGESTED.map((label) => pages.find((page) => page.label === label)).filter((page): page is SearchItem => Boolean(page));
  }, [query, pages, remote]);
  const active = results.length === 0 ? -1 : Math.min(cursor, results.length - 1);

  function openPalette() {
    setQuery("");
    setCursor(0);
    setOpen(true);
    if (remote === null && !loading) {
      setLoading(true);
      void loadIndex().then((items) => {
        setRemote(items);
        setLoading(false);
      });
    }
  }

  function go(item: SearchItem | undefined) {
    if (!item) return;
    setOpen(false);
    router.push(item.href);
  }

  // ⌘K / Ctrl+K from anywhere on the page.
  useEffect(() => {
    function onKeyDown(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        if (open) setOpen(false);
        else openPalette();
      } else if (event.key === "Escape" && open) {
        setOpen(false);
      }
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
    // openPalette reads state the handler must see fresh; re-bind on `open`.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, remote, loading]);

  useEffect(() => {
    if (open) inputRef.current?.focus();
  }, [open]);

  return (
    <>
      <button
        type="button"
        onClick={openPalette}
        aria-label="Search the site"
        aria-keyshortcuts="Meta+K Control+K"
        title="Search players, teams and pages (⌘K)"
        className="inline-flex h-9 items-center gap-2 rounded border border-line px-2 text-steel transition hover:text-white focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-coral lg:px-3"
      >
        <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true">
          <circle cx="11" cy="11" r="7" />
          <path d="m20 20-3.5-3.5" />
        </svg>
        <span className="hidden text-xs font-semibold uppercase tracking-[0.16em] lg:inline">Search</span>
        <kbd className="hidden rounded border border-line px-1 font-mono text-[10px] lg:inline">⌘K</kbd>
      </button>

      {open ? (
        <div
          role="dialog"
          aria-modal="true"
          aria-label="Search the site"
          onClick={() => setOpen(false)}
          className="fixed inset-0 z-50 flex items-start justify-center bg-black/70 p-4 pt-[10vh] backdrop-blur-sm"
        >
          <div
            onClick={(event) => event.stopPropagation()}
            className="w-full max-w-xl overflow-hidden rounded-xl border border-border-strong bg-navy shadow-2xl"
          >
            <div className="flex items-center gap-3 border-b border-line px-4">
              <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" aria-hidden="true" className="shrink-0 text-steel">
                <circle cx="11" cy="11" r="7" />
                <path d="m20 20-3.5-3.5" />
              </svg>
              <input
                ref={inputRef}
                type="search"
                role="combobox"
                aria-expanded="true"
                aria-controls={listId}
                aria-activedescendant={active >= 0 ? `${listId}-${active}` : undefined}
                aria-autocomplete="list"
                aria-label="Search players, teams and pages"
                placeholder="Search players, teams and pages…"
                autoComplete="off"
                spellCheck={false}
                value={query}
                onChange={(event) => {
                  setQuery(event.target.value);
                  setCursor(0);
                }}
                onKeyDown={(event) => {
                  if (event.key === "ArrowDown") {
                    event.preventDefault();
                    setCursor((c) => (results.length === 0 ? 0 : (Math.min(c, results.length - 1) + 1) % results.length));
                  } else if (event.key === "ArrowUp") {
                    event.preventDefault();
                    setCursor((c) => (results.length === 0 ? 0 : (Math.min(c, results.length - 1) - 1 + results.length) % results.length));
                  } else if (event.key === "Enter") {
                    event.preventDefault();
                    go(results[active]);
                  }
                }}
                className="h-12 w-full bg-transparent text-base text-white placeholder:text-steel focus:outline-none"
              />
              <button
                type="button"
                onClick={() => setOpen(false)}
                aria-label="Close search"
                className="rounded border border-line px-1.5 py-0.5 font-mono text-[10px] text-steel hover:text-white"
              >
                esc
              </button>
            </div>

            <ul id={listId} role="listbox" aria-label="Results" className="max-h-[50vh] overflow-y-auto p-2">
              {!query.trim() ? (
                <li className="px-3 pb-1 pt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-steel" role="presentation">
                  Jump to
                </li>
              ) : null}
              {results.map((item, index) => (
                <li
                  key={`${item.kind}:${item.href}`}
                  id={`${listId}-${index}`}
                  role="option"
                  aria-selected={index === active}
                  onMouseEnter={() => setCursor(index)}
                >
                  <Link
                    href={item.href}
                    onClick={() => setOpen(false)}
                    tabIndex={-1}
                    className={`flex items-center justify-between gap-3 rounded-lg px-3 py-2 text-sm transition ${
                      index === active ? "bg-line/50 text-white" : "text-steel hover:text-white"
                    }`}
                  >
                    <span className="min-w-0 truncate font-semibold">{item.label}</span>
                    <span className="shrink-0 text-[10px] font-semibold uppercase tracking-wide text-steel">
                      {item.hint ?? KIND_LABEL[item.kind]}
                    </span>
                  </Link>
                </li>
              ))}
              {query.trim() && results.length === 0 ? (
                <li className="px-3 py-6 text-center text-sm text-steel" role="presentation">
                  {loading ? "Loading players and teams…" : `Nothing matches “${query.trim()}”. Try a player, a team, or a page name.`}
                </li>
              ) : null}
            </ul>

            <div className="flex items-center justify-between gap-3 border-t border-line px-4 py-2 text-[10px] text-steel">
              <span>
                <kbd className="font-mono">↑↓</kbd> move · <kbd className="font-mono">↵</kbd> open · <kbd className="font-mono">esc</kbd> close
              </span>
              {loading ? <span aria-live="polite">Loading players and teams…</span> : null}
            </div>
          </div>
        </div>
      ) : null}
    </>
  );
}
